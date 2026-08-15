import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { dashboardDistRoot } from "../scripts/build-dashboard-ui.mjs";
import { DASHBOARD_ASSETS } from "../scripts/dashboard-assets.mjs";

test("builds one deterministic dashboard bundle from the editable public source", async () => {
  const manifest = JSON.parse(await readFile(path.join(dashboardDistRoot, "bundle-manifest.json"), "utf8"));
  assert.deepEqual(Object.keys(manifest.assets), [...DASHBOARD_ASSETS]);

  for (const asset of DASHBOARD_ASSETS) {
    const [source, bundled] = await Promise.all([
      readFile(new URL(`../public/${asset}`, import.meta.url)),
      readFile(path.join(dashboardDistRoot, asset)),
    ]);
    assert.deepEqual(bundled, source);
    assert.equal(manifest.assets[asset], createHash("sha256").update(source).digest("hex"));
  }
});
