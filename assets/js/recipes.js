// assets/js/recipes.js

(function () {
  const RECIPES_INDEX_PATH = "data/recipes/recipes-index.json";
  const RECIPE_DATA_DIR = "data/recipes/";

  // Unit toggle state
  const UNIT_KEY = "familyRecipeUnits";
  const UNIT_MODES = ["metric", "imperial", "kitchen"];
  let currentUnitMode = getSavedUnitMode();

  // Store the currently loaded recipe so we can re-render
  let currentRecipe = null;
  let currentRecipeId = null;

  // Check state storage
  const CHECK_KEY_PREFIX = "familyRecipeChecks:";

  // -----------------------------------------------------------
  // Simple rich-text renderer for [label](https://link) syntax
  // -----------------------------------------------------------

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  // Supports Markdown-style links: [text](https://example.com)
  function renderRichText(str) {
    if (!str) return "";

    // Escape everything first so raw < > & etc are safe
    let escaped = escapeHTML(str);

    // Then turn [label](https://url) into a real <a> link
    const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;

    return escaped.replace(
      linkPattern,
      '<a href="$2" target="_blank" rel="noopener">$1</a>'
    );
  }

  document.addEventListener("DOMContentLoaded", () => {
    const recipeListEl = document.getElementById("recipe-list");
    const recipeContainerEl = document.getElementById("recipe-container");

    if (recipeListEl) {
      // index.html
      initIndexPage();
    } else if (recipeContainerEl) {
      // recipe.html
      initRecipePage();
    }
  });

  // -----------------------------------------------------------
  // Index Page (Home)
  // -----------------------------------------------------------

  let allRecipes = [];
  let activeCategory = "all";

  function initIndexPage() {
    fetch(RECIPES_INDEX_PATH)
      .then(response => {
        if (!response.ok) throw new Error("Failed to load recipes index");
        return response.json();
      })
      .then(data => {
        allRecipes = data;
        renderRecipeList(allRecipes);
        setupSearchAndFilters();
        applyCategoryFromURL();
      })
      .catch(err => {
        console.error(err);
        const el = document.getElementById("recipe-list");
        if (el) el.textContent = "Sorry, we couldn't load the recipes.";
      });
  }

  function applyCategoryFromURL() {
    const params = new URLSearchParams(window.location.search);
    const categoryParam = params.get("category");

    if (!categoryParam) return;

    // Find the matching category button
    const btn = document.querySelector(`.category-btn[data-category="${categoryParam}"]`);
    if (btn) {
      // Set active state
      document.querySelectorAll(".category-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // Set category
      activeCategory = categoryParam;

      // Apply filters
      applyFilters();
    }
  }

  function renderRecipeList(recipes) {
    const listEl = document.getElementById("recipe-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (!recipes || recipes.length === 0) {
      const p = document.createElement("p");
      p.textContent = "No recipes found.";
      listEl.appendChild(p);
      return;
    }

    recipes.forEach(recipe => {
      const card = document.createElement("article");
      card.className = "recipe-card";

      const title = document.createElement("h2");
      title.className = "recipe-card-title";
      title.textContent = recipe.name;

      const meta = document.createElement("p");
      meta.className = "recipe-card-meta";
      meta.textContent = recipe.category ?? "";

      const tagsEl = document.createElement("div");
      tagsEl.className = "recipe-card-tags";
      if (Array.isArray(recipe.tags)) {
        recipe.tags.forEach(tag => {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = tag;
          tagsEl.appendChild(span);
        });
      }

      const link = document.createElement("a");
      link.className = "recipe-card-link";
      link.href = `recipe.html?id=${encodeURIComponent(recipe.id)}`;
      link.textContent = "View recipe";

      card.appendChild(title);
      card.appendChild(meta);
      card.appendChild(tagsEl);
      card.appendChild(link);

      listEl.appendChild(card);
    });
  }

  function setupSearchAndFilters() {
    const searchInput = document.getElementById("search-input");
    const categoryButtons = document.querySelectorAll(".category-btn");

    if (searchInput) {
      searchInput.addEventListener("input", () => applyFilters());
    }

    categoryButtons.forEach(btn => {
      btn.addEventListener("click", () => {
        activeCategory = btn.getAttribute("data-category") || "all";
        categoryButtons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        applyFilters();
      });
    });
  }

  // --- NEW SEARCH HELPERS (Title + Tags + Dietary + AND/OR) ---

  function formatKey(key) {
    return String(key)
      .replace(/_/g, " ")
      .replace(/-/g, " ")
      .replace(/\b\w/g, c => c.toUpperCase());
  }

  // Build one lowercase searchable string per recipe
  function buildSearchHaystack(recipe) {
    const parts = [];

    // Title
    if (recipe && recipe.name) parts.push(String(recipe.name));

    // Category (nice bonus; doesn’t hurt)
    if (recipe && recipe.category) {
      parts.push(String(recipe.category));
      parts.push(formatKey(recipe.category)); // "dinner" -> "Dinner"
    }

    // Tags
    if (recipe && Array.isArray(recipe.tags)) {
      recipe.tags.forEach(t => parts.push(String(t)));
    }

    // Dietary flags: include ONLY flags that are true
    if (recipe && recipe.dietary_flags && typeof recipe.dietary_flags === "object") {
      Object.entries(recipe.dietary_flags).forEach(([key, value]) => {
        if (value === true) {
          parts.push(String(key));                 // "gluten_free"
          parts.push(String(key).replace(/_/g, " ")); // "gluten free"
          parts.push(formatKey(key));              // "Gluten Free"
        }
      });
    }

    return parts.join(" ").toLowerCase();
  }

  // Multi-word AND; commas split OR groups
  // Example: "blueberry healthy, shells" =>
  //   [ ["blueberry","healthy"], ["shells"] ]
  function parseQueryToOrGroups(rawQuery) {
    const q = (rawQuery || "").trim().toLowerCase();
    if (!q) return [];

    return q
      .split(",")
      .map(group => group.trim())
      .filter(Boolean)
      .map(group => group.split(/\s+/).map(t => t.trim()).filter(Boolean))
      .filter(tokens => tokens.length > 0);
  }

  function matchesQuery(haystack, rawQuery) {
    const orGroups = parseQueryToOrGroups(rawQuery);
    if (!orGroups.length) return true;

    // OR over groups; AND within a group
    return orGroups.some(andTokens => andTokens.every(token => haystack.includes(token)));
  }

  function applyFilters() {
    const searchInput = document.getElementById("search-input");
    const query = searchInput ? searchInput.value.trim() : "";

    const filtered = allRecipes.filter(recipe => {
      // Keep your existing category button behavior (for now)
      if (activeCategory !== "all" && recipe.category !== activeCategory) return false;

      // NEW: search across title + tags + dietary + (bonus category),
      // with spaces=AND and commas=OR
      if (query) {
        const haystack = buildSearchHaystack(recipe);
        if (!matchesQuery(haystack, query)) return false;
      }

      return true;
    });

    renderRecipeList(filtered);
  }

  // -----------------------------------------------------------
  // Recipe Page Logic
  // -----------------------------------------------------------

  function initRecipePage() {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");

    if (!id) {
      displayRecipeError("No recipe ID provided.");
      return;
    }

    currentRecipeId = id;

    fetch(`${RECIPE_DATA_DIR}${id}.json`)
      .then(response => {
        if (!response.ok) throw new Error("Failed to load recipe: " + id);
        return response.json();
      })
      .then(recipe => renderRecipePage(recipe))
      .catch(err => {
        console.error(err);
        displayRecipeError("Sorry, we couldn't load this recipe.");
      });
  }

  function displayRecipeError(message) {
    const titleEl = document.getElementById("recipe-title");
    const container = document.getElementById("recipe-container");
    if (titleEl) titleEl.textContent = "Recipe not found";
    if (container) {
      container.innerHTML = "";
      const p = document.createElement("p");
      p.textContent = message;
      container.appendChild(p);
    }
  }

  function renderRecipePage(recipe) {
    currentRecipe = recipe;

    // ----- Title -----
    const titleEl = document.getElementById("recipe-title");
    if (titleEl) titleEl.textContent = recipe.name || "Untitled recipe";
    updateBreadcrumb(recipe);

    // ----- Tags -----
    const tagsEl = document.getElementById("recipe-tags");
    if (tagsEl) {
      tagsEl.innerHTML = "";
      if (Array.isArray(recipe.tags) && recipe.tags.length > 0) {
        const label = document.createElement("strong");
        label.textContent = "Tags: ";
        tagsEl.appendChild(label);
        recipe.tags.forEach(tag => {
          const span = document.createElement("span");
          span.className = "tag";
          span.textContent = tag;
          tagsEl.appendChild(span);
        });
      }
    }

    // ----- Dietary Flags -----
    const flagsEl = document.getElementById("recipe-dietary-flags");
    if (flagsEl && recipe.dietary_flags) {
      flagsEl.innerHTML = "";
      const label = document.createElement("strong");
      label.textContent = "Dietary: ";
      flagsEl.appendChild(label);

      Object.entries(recipe.dietary_flags).forEach(([key, value]) => {
        if (value) {
          const span = document.createElement("span");
          span.className = "badge";
          span.textContent = key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
          flagsEl.appendChild(span);
        }
      });
    }

    // ----- Time / Servings badges -----
    renderInfoBadges(recipe);

    // ----- Hero Image -----
    renderHeroImage(recipe);

    // ----- Source / attribution -----
    renderSource(recipe);

    // ----- Family Ratings -----
    const ratingsEl = document.getElementById("family-ratings");
    if (ratingsEl && Array.isArray(recipe.family_ratings) && recipe.family_ratings.length > 0) {
      ratingsEl.innerHTML = "<h2>Family Ratings</h2>";
      const ul = document.createElement("ul");
      recipe.family_ratings.forEach(entry => {
        const li = document.createElement("li");
        const stars = entry.stars ? "★".repeat(entry.stars) : "";
        li.textContent = `${entry.name}: ${stars} ${entry.comment ? "- " + entry.comment : ""}`;
        ul.appendChild(li);
      });
      ratingsEl.appendChild(ul);
    }

    // ----- Ingredients -----
    setupUnitToggle();
    renderIngredients(recipe);

    // ----- Steps -----
    const stepsList = document.getElementById("steps-list");
    if (stepsList) {
      stepsList.innerHTML = "";
      if (Array.isArray(recipe.steps)) {
        recipe.steps.forEach((stepText, index) => {
          const li = document.createElement("li");
          li.classList.add("step-item");
          li.dataset.stepIndex = String(index);

          // Check button
          const btn = document.createElement("button");
          btn.className = "check-btn check-btn--square";
          btn.type = "button";
          btn.setAttribute("aria-pressed", "false");

          const icon = document.createElement("span");
          icon.className = "check-icon";
          icon.setAttribute("aria-hidden", "true");
          btn.appendChild(icon);

          // Step text with rich link support
          const textSpan = document.createElement("span");
          textSpan.className = "step-text";
          textSpan.innerHTML = renderRichText(stepText);

          li.appendChild(btn);
          li.appendChild(textSpan);
          stepsList.appendChild(li);
        });
      }
    }

    // Apply any saved checked state (for both ingredients & steps)
    applySavedCheckState();

    // ----- Nutrition -----
    renderNutritionSection(recipe.nutrition);

    // ----- Notes -----
    const notesList = document.getElementById("notes-list");
    if (notesList) {
      notesList.innerHTML = "";
      if (Array.isArray(recipe.notes)) {
        recipe.notes.forEach(note => {
          const li = document.createElement("li");
          li.innerHTML = renderRichText(note);
          notesList.appendChild(li);
        });
      }
    }

    // ----- Clear / Reset Checkmarks Buttons -----
    const clearIngredientsBtn = document.getElementById("clear-ingredient-checks-btn");
    if (clearIngredientsBtn) {
      clearIngredientsBtn.addEventListener("click", () => {
        clearCheckState("ingredients");
      });
    }

    const clearStepsBtn = document.getElementById("clear-step-checks-btn");
    if (clearStepsBtn) {
      clearStepsBtn.addEventListener("click", () => {
        clearCheckState("steps");
      });
    }
  }

  function updateBreadcrumb(recipe) {
    const categoryLink = document.getElementById("breadcrumb-category-link");
    const currentEl = document.getElementById("breadcrumb-current");

    if (!categoryLink || !currentEl) return;

    const rawCategory = recipe.category || "";
    const categoryName = rawCategory
      ? rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1)
      : "Category";

    // Label the crumb
    categoryLink.textContent = categoryName;

    // Make it navigate to homepage filtered by that category
    categoryLink.href = `index.html?category=${encodeURIComponent(rawCategory)}`;

    // Current page label
    currentEl.textContent = recipe.name || "Untitled recipe";
  }

  // -----------------------------------------------------------
  // Time / Servings Badges + Hero Image + Source
  // -----------------------------------------------------------

  function renderInfoBadges(recipe) {
    const container = document.getElementById("recipe-info-badges");
    if (!container) return;

    container.innerHTML = "";

    const items = [];

    if (typeof recipe.prep_time_minutes === "number") {
      items.push(`Prep: ${recipe.prep_time_minutes} min`);
    }
    if (typeof recipe.cook_time_minutes === "number") {
      items.push(`Cook: ${recipe.cook_time_minutes} min`);
    }
    if (typeof recipe.servings === "number") {
      items.push(`Serves: ${recipe.servings}`);
    }

    if (!items.length) {
      container.style.display = "none";
      return;
    }

    container.style.display = "";

    // Bold label: "Details:"
    const label = document.createElement("strong");
    label.textContent = "Details: ";
    container.appendChild(label);

    // Then the badges
    items.forEach(text => {
      const span = document.createElement("span");
      span.className = "badge info-badge";
      span.textContent = text;
      container.appendChild(span);
    });
  }

  function renderHeroImage(recipe) {
    const wrapper = document.getElementById("recipe-image-wrapper");
    if (!wrapper) return;

    wrapper.innerHTML = "";

    if (!recipe.image || !recipe.image.src) {
      wrapper.style.display = "none";
      return;
    }

    wrapper.style.display = "";

    const figure = document.createElement("figure");
    figure.className = "recipe-image-figure";

    const img = document.createElement("img");
    img.className = "recipe-image";
    img.src = recipe.image.src;
    img.alt = recipe.image.alt || recipe.name || "Recipe image";
    img.loading = "lazy";

    figure.appendChild(img);
    wrapper.appendChild(figure);
  }

  function renderSource(recipe) {
    const sourceEl = document.getElementById("recipe-source");
    if (!sourceEl) return;

    sourceEl.innerHTML = "";

    // No source present
    if (!recipe.source) {
      sourceEl.style.display = "none";
      return;
    }

    sourceEl.style.display = "";

    const p = document.createElement("p");

    const label = document.createElement("strong");
    label.textContent = "Source: ";
    p.appendChild(label);

    // Treat source as markdown-capable string
    const span = document.createElement("span");
    span.innerHTML = renderRichText(String(recipe.source));
    p.appendChild(span);

    sourceEl.appendChild(p);
  }

  // -----------------------------------------------------------
  // Unit Toggle + Ingredient Rendering
  // -----------------------------------------------------------

  function getSavedUnitMode() {
    try {
      const saved = localStorage.getItem(UNIT_KEY);
      if (UNIT_MODES.includes(saved)) return saved;
    } catch { }
    // Default to kitchen since it's the most human-friendly
    return "kitchen";
  }

  function saveUnitMode(mode) {
    try {
      localStorage.setItem(UNIT_KEY, mode);
    } catch { }
  }

  function setupUnitToggle() {
    const buttons = document.querySelectorAll(".units-btn");
    if (!buttons.length) return;

    buttons.forEach(btn => {
      const mode = btn.getAttribute("data-units");
      btn.classList.toggle("active", mode === currentUnitMode);

      btn.addEventListener("click", () => {
        const selectedMode = btn.getAttribute("data-units");
        if (!UNIT_MODES.includes(selectedMode)) return;

        currentUnitMode = selectedMode;
        saveUnitMode(selectedMode);

        buttons.forEach(b => b.classList.remove("active"));
        btn.classList.add("active");

        if (currentRecipe) {
          renderIngredients(currentRecipe);
        }
      });
    });
  }

  function convertIngredientUnits(ingredient, mode) {
    const amounts = ingredient.amounts || {};

    // KITCHEN MODE: simple text only (like "1 3/4 cup milk")
    if (mode === "kitchen") {
      const kitchenText = amounts.kitchen;
      if (kitchenText) {
        return {
          displayText: `${kitchenText}`
        };
      }
      // Fallback if no kitchen text
      return {
        displayText: ingredient.item || ""
      };
    }

    // METRIC or IMPERIAL numeric mode
    const base = amounts[mode];

    if (base) {
      const qty = base.quantity ?? "";
      const unit = base.unit ? ` ${base.unit}` : "";
      const item = ingredient.item || "";
      return {
        displayText: `${qty}${unit} ${item}`.trim()
      };
    }

    // Fallback to any legacy fields if present
    const qty = ingredient.quantity ?? "";
    const unit = ingredient.unit ? ` ${ingredient.unit}` : "";
    const item = ingredient.item || "";
    return {
      displayText: `${qty}${unit} ${item}`.trim()
    };
  }

  function renderIngredients(recipe) {
    const dryList = document.getElementById("ingredients-dry");
    const wetList = document.getElementById("ingredients-wet");

    if (!dryList || !wetList) return;

    dryList.innerHTML = "";
    wetList.innerHTML = "";

    if (!Array.isArray(recipe.ingredients)) return;

    const dryIngredients = [];
    const wetIngredients = [];
    const otherIngredients = [];

    recipe.ingredients.forEach((ing, index) => {
      const type = (ing.type || "").toLowerCase();
      const entry = { ing, index };
      if (type === "dry") {
        dryIngredients.push(entry);
      } else if (type === "wet") {
        wetIngredients.push(entry);
      } else {
        otherIngredients.push(entry);
      }
    });

    function createIngredientLi(entry) {
      const { ing, index } = entry;
      const li = document.createElement("li");
      li.classList.add("ingredient-item");
      li.dataset.ingredientIndex = String(index);

      const { displayText } = convertIngredientUnits(ing, currentUnitMode);
      const notes = ing.notes ? ` (${ing.notes})` : "";
      const fullText = `${displayText}${notes}`;

      const btn = document.createElement("button");
      btn.className = "check-btn check-btn--circle";
      btn.type = "button";
      btn.setAttribute("aria-pressed", "false");

      const icon = document.createElement("span");
      icon.className = "check-icon";
      icon.setAttribute("aria-hidden", "true");
      btn.appendChild(icon);

      const textSpan = document.createElement("span");
      textSpan.className = "ingredient-text";
      textSpan.innerHTML = renderRichText(fullText);

      li.appendChild(btn);
      li.appendChild(textSpan);

      return li;
    }

    dryIngredients.forEach(entry => {
      dryList.appendChild(createIngredientLi(entry));
    });

    wetIngredients.forEach(entry => {
      wetList.appendChild(createIngredientLi(entry));
    });

    otherIngredients.forEach(entry => {
      wetList.appendChild(createIngredientLi(entry));
    });

    applySavedCheckState();
  }

  // -----------------------------------------------------------
  // Nutrition Rendering
  // -----------------------------------------------------------

  function renderNutritionSection(nutrition) {
    if (!nutrition || typeof nutrition !== "object") return;

    const section = document.querySelector('#nutrition-macros')?.closest('.recipe-section');
    if (!section) return;

    const oldHeader = section.querySelector('.nutrition-serving-header');
    if (oldHeader) oldHeader.remove();

    const serving = nutrition.serving_size?.trim();
    const header = document.createElement("p");
    header.className = "nutrition-serving-header";
    header.innerHTML = serving
      ? `<em>Per ${serving}</em>`
      : `<em>Per serving</em>`;
    section.insertBefore(header, section.children[1]);

    const groups = [
      ["nutrition-macros", "Macros", nutrition.macros],
      ["nutrition-carbs", "Carbohydrates", nutrition.carbohydrates],
      ["nutrition-vitamins", "Vitamins", nutrition.vitamins],
      ["nutrition-minerals", "Minerals", nutrition.minerals],
      ["nutrition-lipids", "Lipids", nutrition.lipids]
    ];

    groups.forEach(([id, title, group]) => {
      const container = document.getElementById(id);
      if (!container) return;

      container.innerHTML = "";

      const entries = group
        ? Object.entries(group).filter(([_, val]) => val !== null && val !== "")
        : [];

      if (!entries.length) return;

      const h3 = document.createElement("h3");
      h3.textContent = title;
      container.appendChild(h3);

      const ul = document.createElement("ul");
      entries.forEach(([key, value]) => {
        const li = document.createElement("li");
        li.textContent = `${formatNutritionKey(key)}: ${value}`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    });
  }

  function formatNutritionKey(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }

  // -----------------------------------------------------------
  // Check state persistence
  // -----------------------------------------------------------

  function getCheckStorageKey() {
    if (!currentRecipeId) return null;
    return CHECK_KEY_PREFIX + currentRecipeId;
  }

  function loadCheckState() {
    const key = getCheckStorageKey();
    if (!key) return { ingredients: [], steps: [] };

    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { ingredients: [], steps: [] };
      const parsed = JSON.parse(raw);
      return {
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        steps: Array.isArray(parsed.steps) ? parsed.steps : []
      };
    } catch {
      return { ingredients: [], steps: [] };
    }
  }

  function saveCheckState() {
    const key = getCheckStorageKey();
    if (!key) return;

    const ingredientsState = [];
    const stepsState = [];

    document.querySelectorAll(".ingredient-item").forEach(li => {
      const index = parseInt(li.dataset.ingredientIndex, 10);
      if (Number.isNaN(index)) return;
      ingredientsState[index] = li.classList.contains("is-checked");
    });

    document.querySelectorAll(".step-item").forEach(li => {
      const index = parseInt(li.dataset.stepIndex, 10);
      if (Number.isNaN(index)) return;
      stepsState[index] = li.classList.contains("is-checked");
    });

    const payload = {
      ingredients: ingredientsState,
      steps: stepsState
    };

    try {
      localStorage.setItem(key, JSON.stringify(payload));
    } catch {
      // ignore storage errors
    }
  }

  function applySavedCheckState() {
    const { ingredients, steps } = loadCheckState();

    // Ingredients
    document.querySelectorAll(".ingredient-item").forEach(li => {
      const index = parseInt(li.dataset.ingredientIndex, 10);
      if (Number.isNaN(index)) return;

      const checked = ingredients[index];
      const btn = li.querySelector(".check-btn");

      if (checked) {
        li.classList.add("is-checked");
        if (btn) btn.setAttribute("aria-pressed", "true");
      } else {
        li.classList.remove("is-checked");
        if (btn) btn.setAttribute("aria-pressed", "false");
      }
    });

    // Steps
    document.querySelectorAll(".step-item").forEach(li => {
      const index = parseInt(li.dataset.stepIndex, 10);
      if (Number.isNaN(index)) return;

      const checked = steps[index];
      const btn = li.querySelector(".check-btn");

      if (checked) {
        li.classList.add("is-checked");
        if (btn) btn.setAttribute("aria-pressed", "true");
      } else {
        li.classList.remove("is-checked");
        if (btn) btn.setAttribute("aria-pressed", "false");
      }
    });
  }

  function clearCheckState(scope) {
    const selectors = [];
    if (scope === "ingredients" || scope === "all") {
      selectors.push(".ingredient-item.is-checked");
    }
    if (scope === "steps" || scope === "all") {
      selectors.push(".step-item.is-checked");
    }
    if (!selectors.length) return;

    document.querySelectorAll(selectors.join(", ")).forEach(li => {
      li.classList.remove("is-checked");
      const btn = li.querySelector(".check-btn");
      if (btn) btn.setAttribute("aria-pressed", "false");
    });

    saveCheckState();
  }

  // -----------------------------------------------------------
  // Check / Uncheck behavior for ingredients & steps
  // -----------------------------------------------------------
  document.addEventListener("click", (event) => {
    const btn = event.target.closest(".check-btn");
    if (!btn) return;

    const listItem = btn.closest(".ingredient-item, .step-item");
    if (!listItem) return;

    const isChecked = listItem.classList.toggle("is-checked");
    btn.setAttribute("aria-pressed", String(isChecked));

    saveCheckState();
  });
})();