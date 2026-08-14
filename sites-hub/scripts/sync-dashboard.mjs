import { copyFile, mkdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const sourceRoot = fileURLToPath(new URL("../../public/", import.meta.url));
const targetRoot = fileURLToPath(new URL("../public/dashboard/", import.meta.url));
const assets = [
  "api-pricing.js",
  "app.js",
  "date-range.js",
  "icon.svg",
  "index.html",
  "quota-forecast.js",
  "styles.css",
  "translations.js",
  "usage-pricing.js",
  "visualization.js",
];

await mkdir(targetRoot, { recursive: true });
for (const asset of assets) {
  await copyFile(join(sourceRoot, asset), join(targetRoot, asset));
}

console.log(`Dashboard partagé synchronisé depuis ${basename(projectRoot)} (${assets.length} fichiers).`);
