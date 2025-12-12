// assets/js/main.js

(function () {
  const THEME_KEY = "familyRecipeTheme";
  const THEMES = ["theme-scifi", "theme-fantasy"];
  const DEFAULT_THEME = "theme-scifi";

  function getSavedTheme() {
    const saved = localStorage.getItem(THEME_KEY);
    if (THEMES.includes(saved)) {
      return saved;
    }
    return DEFAULT_THEME;
  }

  function applyTheme(theme) {
    const body = document.body;
    // Remove all known theme classes first
    THEMES.forEach(t => body.classList.remove(t));
    body.classList.add(theme);
    localStorage.setItem(THEME_KEY, theme);
    updateThemeToggleLabel(theme);
  }

  function updateThemeToggleLabel(theme) {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return; // not all pages have to have this

    if (theme === "theme-scifi") {
      btn.textContent = "Switch to Fantasy Theme";
    } else {
      btn.textContent = "Switch to Sci-Fi Theme";
    }
  }

  function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    if (!btn) return;

    btn.addEventListener("click", () => {
      const currentTheme = THEMES.find(t => document.body.classList.contains(t)) || DEFAULT_THEME;
      const nextTheme = currentTheme === "theme-scifi" ? "theme-fantasy" : "theme-scifi";
      applyTheme(nextTheme);
    });
  }

  // Initialize on page load
  document.addEventListener("DOMContentLoaded", () => {
    const initialTheme = getSavedTheme();
    applyTheme(initialTheme);
    setupThemeToggle();
  });
})();