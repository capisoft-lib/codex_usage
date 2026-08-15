export const DASHBOARD_API_VERSION = 1;

export function hostedDashboardCapabilities() {
  return {
    apiVersion: DASHBOARD_API_VERSION,
    runtime: "hosted",
    sources: ["centralized"],
    defaultSource: "centralized",
    canRefresh: false,
    adminUrl: "/admin",
  };
}
