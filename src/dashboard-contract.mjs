export const DASHBOARD_API_VERSION = 1;
export const DASHBOARD_SOURCES = Object.freeze(["local", "centralized"]);

export function createDashboardCapabilities({ runtime, sources, defaultSource, canRefresh, adminUrl = null }) {
  if (!runtime || !Array.isArray(sources) || !sources.length) throw new Error("Capacités dashboard invalides.");
  if (!sources.every((source) => DASHBOARD_SOURCES.includes(source))) throw new Error("Source dashboard inconnue.");
  if (!sources.includes(defaultSource)) throw new Error("Source dashboard par défaut invalide.");
  return {
    apiVersion: DASHBOARD_API_VERSION,
    runtime,
    sources: [...sources],
    defaultSource,
    canRefresh: Boolean(canRefresh),
    adminUrl,
  };
}
