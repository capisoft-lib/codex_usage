// A small blocking script, loaded before CSS, restores the palette before paint.
// Keep IDs and browser colors aligned with the palette selectors in styles.css.
(() => {
  const storageKey = "codex-usage-theme";
  const themes = Object.freeze([
    Object.freeze({ id: "green", color: "#0e110f" }),
    Object.freeze({ id: "blue", color: "#0a0b0d" }),
    Object.freeze({ id: "violet", color: "#121019" }),
    Object.freeze({ id: "amber", color: "#15110c" }),
  ]);
  const normalize = (id) => themes.find((theme) => theme.id === id) || themes[0];
  let current;

  function apply(id) {
    const theme = normalize(id);
    current = theme.id;
    document.documentElement.dataset.theme = theme.id;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme.color);
    document.dispatchEvent(new CustomEvent("dashboardthemechange", { detail: theme.id }));
  }

  function setTheme(id) {
    apply(id);
    try { localStorage.setItem(storageKey, current); }
    catch { /* The theme remains usable in this tab when storage is unavailable. */ }
  }

  let saved;
  try { saved = localStorage.getItem(storageKey); }
  catch { /* The original green palette is the default. */ }
  apply(saved);

  globalThis.CodexUsageThemes = Object.freeze({ themes, setTheme, getTheme: () => current });
  globalThis.addEventListener("storage", (event) => {
    try {
      if (event.storageArea === localStorage && (event.key === storageKey || event.key === null)) {
        apply(event.key === null ? null : event.newValue);
      }
    } catch { /* Storage access can be denied after the page was opened. */ }
  });
})();
