import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DASHBOARD_ASSETS } from "./dashboard-assets.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, "..");
const sourceRoot = path.join(projectRoot, "public");
export const dashboardDistRoot = path.join(projectRoot, "dist", "dashboard");

function assertGeneratedTarget(target) {
  const expected = path.join(projectRoot, "dist", "dashboard");
  if (path.resolve(target) !== expected) throw new Error(`Cible de bundle UI inattendue : ${target}`);
}

export async function buildDashboardUi() {
  assertGeneratedTarget(dashboardDistRoot);
  await rm(dashboardDistRoot, { recursive: true, force: true });
  await mkdir(dashboardDistRoot, { recursive: true });

  const manifest = { version: 1, assets: {} };
  for (const asset of DASHBOARD_ASSETS) {
    const source = path.join(sourceRoot, asset);
    const target = path.join(dashboardDistRoot, asset);
    const content = await readFile(source);
    await copyFile(source, target);
    manifest.assets[asset] = createHash("sha256").update(content).digest("hex");
  }
  await writeFile(path.join(dashboardDistRoot, "bundle-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { target: dashboardDistRoot, count: DASHBOARD_ASSETS.length, manifest };
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  const result = await buildDashboardUi();
  console.log(`Bundle UI généré dans ${path.relative(projectRoot, result.target)} (${result.count} fichiers).`);
}
