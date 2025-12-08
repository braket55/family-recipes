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

  function applyFilters() {
    const searchInput = document.getElementById("search-input");
    const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = allRecipes.filter(recipe => {
      if (activeCategory !== "all" && recipe.category !== activeCategory) return false;

      if (query) {
        const nameMatch = recipe.name.toLowerCase().includes(query);
        const tagMatch = Array.isArray(recipe.tags)
          ? recipe.tags.some(tag => tag.toLowerCase().includes(query))
          : false;
        if (!nameMatch && !tagMatch) return false;
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
        recipe.steps.forEach(step => {
          const li = document.createElement("li");
          li.textContent = step;
          stepsList.appendChild(li);
        });
      }
    }

    // ----- Nutrition -----
    renderNutritionSection(recipe.nutrition);

    // ----- Notes -----
    const notesList = document.getElementById("notes-list");
    if (notesList) {
      notesList.innerHTML = "";
      if (Array.isArray(recipe.notes)) {
        recipe.notes.forEach(note => {
          const li = document.createElement("li");
          li.textContent = note;
          notesList.appendChild(li);
        });
      }
    }
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

  // ingredient.amounts structure:
  // {
  //   "metric":   { "quantity": 414, "unit": "ml" },
  //   "imperial": { "quantity": 14, "unit": "fl oz" },
  //   "kitchen":  "1 3/4 cup milk"
  // }
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
    const list = document.getElementById("ingredients-list");
    if (!list) return;

    list.innerHTML = "";

    if (!Array.isArray(recipe.ingredients)) return;

    recipe.ingredients.forEach(ing => {
      const li = document.createElement("li");
      const { displayText } = convertIngredientUnits(ing, currentUnitMode);
      const notes = ing.notes ? ` (${ing.notes})` : "";
      li.textContent = `${displayText}${notes}`;
      list.appendChild(li);
    });
  }

  // -----------------------------------------------------------
  // Nutrition Rendering
  // -----------------------------------------------------------

  function renderNutritionSection(nutrition) {
    if (!nutrition || typeof nutrition !== "object") return;

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
        li.textContent = `${formatKey(key)}: ${value}`;
        ul.appendChild(li);
      });
      container.appendChild(ul);
    });
  }

  function formatKey(key) {
    return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
})();
