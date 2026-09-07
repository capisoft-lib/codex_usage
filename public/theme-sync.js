// Hosted pages share the owner's palette with signed desktop readers.
(() => {
  if (!location.pathname.startsWith("/dashboard/") && location.pathname !== "/admin") return;
  const manager = globalThis.CodexUsageThemes;
  if (!manager) return;
  let applying = false;
  let revision = 0;
  let pending = Promise.resolve();
  const valid = (theme) => manager.themes.some((entry) => entry.id === theme);
  function save(theme) {
    pending = pending.catch(() => {}).then(async () => {
      const response = await fetch("/api/preferences", {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ theme }), cache: "no-store",
      });
      if (!response.ok) throw new Error("Theme synchronization unavailable");
    }).catch(() => { /* Keep the local palette usable while offline. */ });
  }
  document.addEventListener("dashboardthemechange", (event) => {
    if (applying || !valid(event.detail)) return;
    revision++;
    save(event.detail);
  });
  async function restore() {
    const started = revision;
    try {
      const response = await fetch("/api/preferences", { cache: "no-store" });
      if (!response.ok || started !== revision) return;
      const { theme } = await response.json();
      if (started !== revision) return;
      if (valid(theme)) {
        applying = true;
        try { manager.setTheme(theme); } finally { applying = false; }
      } else save(manager.getTheme()); // Migrate the existing browser preference once.
    } catch { /* Offline pages keep their last known theme. */ }
  }
  void restore();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) void restore(); });
})();
