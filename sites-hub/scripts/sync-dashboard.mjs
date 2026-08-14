import { copyFile, mkdir, readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildDashboardUi, dashboardDistRoot } from "../../scripts/build-dashboard-ui.mjs";
import { DASHBOARD_ASSETS } from "../../scripts/dashboard-assets.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const targetRoot = fileURLToPath(new URL("../public/dashboard/", import.meta.url));

await buildDashboardUi();

await mkdir(targetRoot, { recursive: true });
for (const asset of DASHBOARD_ASSETS) {
  await copyFile(join(dashboardDistRoot, asset), join(targetRoot, asset));
}
await copyFile(join(dashboardDistRoot, "bundle-manifest.json"), join(targetRoot, "bundle-manifest.json"));

const manifest = JSON.parse(await readFile(join(targetRoot, "bundle-manifest.json"), "utf8"));

console.log(`Dashboard partagé synchronisé depuis ${basename(projectRoot)} (${Object.keys(manifest.assets).length} fichiers, bundle v${manifest.version}).`);
