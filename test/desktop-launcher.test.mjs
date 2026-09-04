import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("desktop helper keeps the server local and opens an always-on-top mini window", async () => {
  const [desktop, server, browser, packageJson] = await Promise.all([
    readFile(new URL("../desktop.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8").then(JSON.parse),
  ]);

  assert.match(desktop, /const host = "127\.0\.0\.1"/);
  assert.match(desktop, /alwaysOnTop: true/);
  assert.match(desktop, /contextIsolation: true/);
  assert.match(desktop, /nodeIntegration: false/);
  assert.match(desktop, /sandbox: true/);
  assert.match(desktop, /message\?\.type === "open-mini-quota"/);
  assert.match(desktop, /fiveHour && weekly \? 410 : 220/);
  assert.match(desktop, /app\.on\("window-all-closed"/);
  assert.match(server, /process\.send\(\{ type: "open-mini-quota", preferences/);
  assert.match(browser, /runtimeCapabilities\.desktopHelper/);
  assert.match(browser, /MINI_QUOTA_VISIBILITY_KEY/);
  assert.match(browser, /fiveHour: miniQuotaVisibility\.fiveHour \? "1" : "0"/);
  assert.match(packageJson.scripts.start, /electron desktop\.mjs/);
  assert.match(packageJson.scripts["start:browser"], /node server\.mjs/);
});
