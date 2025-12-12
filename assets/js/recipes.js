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

    let escaped = escapeHTML(str);
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
  // Index Page (Home) — Search + Filters dropdown
  // -----------------------------------------------------------

  let allRecipes = [];

  // Filters state:
  // - categories: ANY match (OR)
  // - dietary: ALL selected must be true (AND)
  // - tags: ANY match (OR)
  let activeCategories = new Set();
  let activeDietaryKeys = new Set();
  let activeTags = new Set();

  // Friendly labels (used if present; otherwise fallback to formatKey)
  const DIETARY_LABELS = {
    dairy_free: "Dairy-free",
    gluten_free: "Gluten-free",
    vegetarian: "Vegetarian",
    vegan: "Vegan",
    nut_free: "Nut-free",
    soy_free: "Soy-free",
    egg_free: "Egg-free",
    low_sugar: "Low sugar",
    high_protein: "High protein"
  };

  function initIndexPage() {
    fetch(RECIPES_INDEX_PATH)
      .then(response => {
        if (!response.ok) throw new Error("Failed to load recipes index");
        return response.json();
      })
      .then(data => {
        allRecipes = data;

        setupSearch();

        buildCategoryFilterUI(allRecipes);
        buildDietaryFilterUI(allRecipes);
        buildTagFilterUI(allRecipes);

        setupClearButtons();

        // If user came from a recipe breadcrumb like index.html?category=dinner,
        // preselect that category chip.
        applyCategoryFromURL();

        // Ensure counts are correct on load (including URL preselect)
        updateFilterHeaderCounts();

        applyFilters();
      })
      .catch(err => {
        console.error(err);
        const el = document.getElementById("recipe-list");
        if (el) el.textContent = "Sorry, we couldn't load the recipes.";
      });
  }

  function setupSearch() {
    const searchInput = document.getElementById("search-input");
    if (searchInput) searchInput.addEventListener("input", () => applyFilters());
  }

  function applyCategoryFromURL() {
    const params = new URLSearchParams(window.location.search);
    const categoryParam = params.get("category");
    if (!categoryParam) return;

    activeCategories.add(categoryParam);

    // Find the matching category chip and mark active
    const btn = document.querySelector(`#category-filters button[data-value="${cssEscapeAttr(categoryParam)}"]`);
    if (btn) btn.classList.add("active");
  }

  function cssEscapeAttr(str) {
    // Escape quotes for attribute selector usage
    return String(str).replace(/"/g, '\\"');
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

  function buildCategoryFilterUI(recipes) {
    const container = document.getElementById("category-filters");
    if (!container) return;
    container.innerHTML = "";

    const categories = new Set();
    (recipes || []).forEach(r => {
      const c = String(r?.category || "").trim();
      if (c) categories.add(c);
    });

    const sorted = Array.from(categories).sort((a, b) => a.localeCompare(b));

    sorted.forEach(cat => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = formatKey(cat);
      btn.dataset.value = cat;

      btn.addEventListener("click", () => {
        if (activeCategories.has(cat)) {
          activeCategories.delete(cat);
          btn.classList.remove("active");
        } else {
          activeCategories.add(cat);
          btn.classList.add("active");
        }
        applyFilters();
      });

      container.appendChild(btn);
    });
  }

  function buildDietaryFilterUI(recipes) {
    const allKeys = new Set();

    (recipes || []).forEach(r => {
      const flags = r?.dietary_flags;
      if (flags && typeof flags === "object") {
        Object.keys(flags).forEach(k => allKeys.add(k));
      }
    });

    const keys = allKeys.size
      ? Array.from(allKeys).sort((a, b) => a.localeCompare(b))
      : Object.keys(DIETARY_LABELS);

    const container = document.getElementById("dietary-filters");
    if (!container) return;
    container.innerHTML = "";

    keys.forEach(key => {
      const label = DIETARY_LABELS[key] || formatKey(key);

      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = label;
      btn.dataset.value = key;

      btn.addEventListener("click", () => {
        if (activeDietaryKeys.has(key)) {
          activeDietaryKeys.delete(key);
          btn.classList.remove("active");
        } else {
          activeDietaryKeys.add(key);
          btn.classList.add("active");
        }
        applyFilters();
      });

      container.appendChild(btn);
    });
  }

  function buildTagFilterUI(recipes) {
    const container = document.getElementById("tag-filters");
    if (!container) return;
    container.innerHTML = "";

    const tags = new Set();
    (recipes || []).forEach(r => {
      if (Array.isArray(r?.tags)) r.tags.forEach(t => tags.add(String(t).trim()));
    });

    const sorted = Array.from(tags).filter(Boolean).sort((a, b) => a.localeCompare(b));

    sorted.forEach(tag => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tag";
      btn.textContent = tag;
      btn.dataset.value = tag;

      btn.addEventListener("click", () => {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
          btn.classList.remove("active");
        } else {
          activeTags.add(tag);
          btn.classList.add("active");
        }
        applyFilters();
      });

      container.appendChild(btn);
    });
  }

  function setupClearButtons() {
    const clearCategory = document.getElementById("clear-category-btn");
    const clearDietary = document.getElementById("clear-dietary-btn");
    const clearTags = document.getElementById("clear-tags-btn");
    const clearAll = document.getElementById("clear-all-filters-btn");

    if (clearCategory) {
      clearCategory.addEventListener("click", (e) => {
        // prevent <details> toggle weirdness in some browsers
        e.preventDefault();
        activeCategories.clear();
        document.querySelectorAll("#category-filters button.tag").forEach(b => b.classList.remove("active"));
        applyFilters();
      });
    }

    if (clearDietary) {
      clearDietary.addEventListener("click", (e) => {
        e.preventDefault();
        activeDietaryKeys.clear();
        document.querySelectorAll("#dietary-filters button.tag").forEach(b => b.classList.remove("active"));
        applyFilters();
      });
    }

    if (clearTags) {
      clearTags.addEventListener("click", (e) => {
        e.preventDefault();
        activeTags.clear();
        document.querySelectorAll("#tag-filters button.tag").forEach(b => b.classList.remove("active"));
        applyFilters();
      });
    }

    if (clearAll) {
      clearAll.addEventListener("click", (e) => {
        e.preventDefault();
        activeCategories.clear();
        activeDietaryKeys.clear();
        activeTags.clear();

        document.querySelectorAll("#category-filters button.tag, #dietary-filters button.tag, #tag-filters button.tag")
          .forEach(b => b.classList.remove("active"));

        applyFilters();
      });
    }
  }

  function recipeMatchesSelectedCategories(recipe) {
    if (!activeCategories.size) return true;
    return activeCategories.has(String(recipe?.category || "").trim());
  }

  // Dietary = ALL selected must be true
  function recipeHasAllDietaryFlags(recipe) {
    if (!activeDietaryKeys.size) return true;
    const flags = recipe?.dietary_flags || {};
    for (const key of activeDietaryKeys) {
      if (flags[key] !== true) return false;
    }
    return true;
  }

  // Tags = ANY selected matches (exact match by tag string)
  function recipeMatchesAnySelectedTag(recipe) {
    if (!activeTags.size) return true;
    if (!Array.isArray(recipe?.tags)) return false;

    const lower = recipe.tags.map(t => String(t).toLowerCase());
    for (const t of activeTags) {
      if (lower.includes(String(t).toLowerCase())) return true;
    }
    return false;
  }

  // --- SEARCH HELPERS (Title + Tags + Dietary + AND/OR) ---

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
    if (recipe?.name) parts.push(String(recipe.name));

    // Category (bonus: lets you search "dinner")
    if (recipe?.category) {
      parts.push(String(recipe.category));
      parts.push(formatKey(recipe.category));
    }

    // Tags
    if (Array.isArray(recipe?.tags)) recipe.tags.forEach(t => parts.push(String(t)));

    // Dietary flags: include ONLY flags that are true
    const flags = recipe?.dietary_flags;
    if (flags && typeof flags === "object") {
      Object.entries(flags).forEach(([key, value]) => {
        if (value === true) {
          parts.push(String(key));                      // "gluten_free"
          parts.push(String(key).replace(/_/g, " "));    // "gluten free"
          parts.push(formatKey(key));                   // "Gluten Free"
          parts.push(DIETARY_LABELS[key] || formatKey(key));
        }
      });
    }

    return parts.join(" ").toLowerCase();
  }

  // spaces=AND, commas=OR
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

  function updateFiltersBadge() {
    const badge = document.getElementById("filters-badge");
    if (!badge) return;

    const count = activeCategories.size + activeDietaryKeys.size + activeTags.size;
    if (count > 0) {
      badge.style.display = "inline-block";
      badge.textContent = String(count);
    } else {
      badge.style.display = "none";
      badge.textContent = "";
    }
  }

  function updateFilterHeaderCounts() {
    const catEl = document.getElementById("category-count");
    const dietEl = document.getElementById("dietary-count");
    const tagEl = document.getElementById("tags-count");

    if (catEl) catEl.textContent = `(${activeCategories.size})`;
    if (dietEl) dietEl.textContent = `(${activeDietaryKeys.size})`;
    if (tagEl) tagEl.textContent = `(${activeTags.size})`;
  }

  function updateActiveFiltersSummary(resultCount) {
    const el = document.getElementById("active-filters-summary");
    if (!el) return;

    const parts = [];

    if (activeCategories.size) {
      parts.push(`Category: ${Array.from(activeCategories).map(formatKey).join(", ")}`);
    }
    if (activeDietaryKeys.size) {
      const labels = Array.from(activeDietaryKeys).map(k => DIETARY_LABELS[k] || formatKey(k));
      parts.push(`Dietary: ${labels.join(", ")}`);
    }
    if (activeTags.size) {
      parts.push(`Tags: ${Array.from(activeTags).join(", ")}`);
    }

    const q = (document.getElementById("search-input")?.value || "").trim();
    if (q) parts.push(`Search: “${q}”`);

    el.textContent = parts.length
      ? `${parts.join(" · ")} · Results: ${resultCount}`
      : `Showing all recipes (${resultCount}).`;
  }

  function applyFilters() {
    const query = (document.getElementById("search-input")?.value || "").trim();

    const filtered = allRecipes.filter(recipe => {
      if (!recipeMatchesSelectedCategories(recipe)) return false;
      if (!recipeHasAllDietaryFlags(recipe)) return false;
      if (!recipeMatchesAnySelectedTag(recipe)) return false;

      if (query) {
        const haystack = buildSearchHaystack(recipe);
        if (!matchesQuery(haystack, query)) return false;
      }

      return true;
    });

    renderRecipeList(filtered);
    updateFiltersBadge();
    updateFilterHeaderCounts();
    updateActiveFiltersSummary(filtered.length);
  }

  // -----------------------------------------------------------
  // Recipe Page Logic (UNCHANGED)
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

    categoryLink.textContent = categoryName;
    categoryLink.href = `index.html?category=${encodeURIComponent(rawCategory)}`;

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

    if (typeof recipe.prep_time_minutes === "number") items.push(`Prep: ${recipe.prep_time_minutes} min`);
    if (typeof recipe.cook_time_minutes === "number") items.push(`Cook: ${recipe.cook_time_minutes} min`);
    if (typeof recipe.servings === "number") items.push(`Serves: ${recipe.servings}`);

    if (!items.length) {
      container.style.display = "none";
      return;
    }

    container.style.display = "";

    const label = document.createElement("strong");
    label.textContent = "Details: ";
    container.appendChild(label);

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

    if (!recipe.source) {
      sourceEl.style.display = "none";
      return;
    }

    sourceEl.style.display = "";

    const p = document.createElement("p");

    const label = document.createElement("strong");
    label.textContent = "Source: ";
    p.appendChild(label);

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
    return "kitchen";
  }

  function saveUnitMode(mode) {
    try { localStorage.setItem(UNIT_KEY, mode); } catch { }
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

        if (currentRecipe) renderIngredients(currentRecipe);
      });
    });
  }

  function convertIngredientUnits(ingredient, mode) {
    const amounts = ingredient.amounts || {};

    if (mode === "kitchen") {
      const kitchenText = amounts.kitchen;
      if (kitchenText) return { displayText: `${kitchenText}` };
      return { displayText: ingredient.item || "" };
    }

    const base = amounts[mode];

    if (base) {
      const qty = base.quantity ?? "";
      const unit = base.unit ? ` ${base.unit}` : "";
      const item = ingredient.item || "";
      return { displayText: `${qty}${unit} ${item}`.trim() };
    }

    const qty = ingredient.quantity ?? "";
    const unit = ingredient.unit ? ` ${ingredient.unit}` : "";
    const item = ingredient.item || "";
    return { displayText: `${qty}${unit} ${item}`.trim() };
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
      if (type === "dry") dryIngredients.push(entry);
      else if (type === "wet") wetIngredients.push(entry);
      else otherIngredients.push(entry);
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

    dryIngredients.forEach(entry => dryList.appendChild(createIngredientLi(entry)));
    wetIngredients.forEach(entry => wetList.appendChild(createIngredientLi(entry)));
    otherIngredients.forEach(entry => wetList.appendChild(createIngredientLi(entry)));

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
    header.innerHTML = serving ? `<em>Per ${serving}</em>` : `<em>Per serving</em>`;
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

    try {
      localStorage.setItem(key, JSON.stringify({ ingredients: ingredientsState, steps: stepsState }));
    } catch { }
  }

  function applySavedCheckState() {
    const { ingredients, steps } = loadCheckState();

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
    if (scope === "ingredients" || scope === "all") selectors.push(".ingredient-item.is-checked");
    if (scope === "steps" || scope === "all") selectors.push(".step-item.is-checked");
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