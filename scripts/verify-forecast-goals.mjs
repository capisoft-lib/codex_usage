// Browser validation with synthetic quota data; never reads the user's sessions.
// Uses the existing desktop Playwright dependency and installed Chrome.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPageData } from "../public/page-data.js";
import { createQuotaDetail, quotaMetadata } from "../public/quota-data.js";
import { FORECAST_GOALS_KEY } from "../public/forecast-goals.js";

const require = createRequire(new URL("../desktop/package.json", import.meta.url));
const { chromium } = require("playwright");
const root = fileURLToPath(new URL("../", import.meta.url));
const source = path.join(root, process.argv.includes("--dist") ? "dist/dashboard" : "public");
const output = path.join(root, ".cache/forecast-goals");
const now = new Date("2026-10-27T20:00:00Z"), hour = 3_600_000, day = 24 * hour;
const iso = time => new Date(time).toISOString();
const start = Date.parse("2026-10-25T20:00:00Z");
const quota = (from, to, percent) => ({
  startsAt: iso(from), endsAt: iso(from + 7 * day), resetsAt: iso(from + 7 * day),
  observedAt: iso(to), peakObservedAt: iso(to), usedPercent: percent, peakUsedPercent: percent,
  remainingPercent: 100 - percent, windowMinutes: 10080, planType: "pro", planTypes: ["pro"],
  observations: Array.from({ length: 5 }, (_, i) => ({ observedAt: iso(from + (to - from) * i / 4), usedPercent: percent * i / 4 })),
});
const data = {
  apiVersion: 1, analyzerVersion: 10, revision: "synthetic-goals-v1", generatedAt: now.toISOString(),
  source: { mode: "local", sessionsAvailable: true, archivedSessionsAvailable: true, sessionIndexAvailable: true },
  weeklyQuota: quota(start, +now, 40), weeklyQuotaHistory: [quota(start - 7 * day, start - hour, 70)],
  nodes: [], sessions: [], errors: [],
};
const mime = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".webmanifest": "application/manifest+json" };
const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (url.pathname.startsWith("/api/")) {
      let body;
      if (url.pathname === "/api/capabilities") body = { apiVersion: 1, runtime: "local", sources: ["local"], defaultSource: "local", canRefresh: true };
      else if (url.pathname === "/api/page") body = createPageData(data, url.searchParams.get("query")).finish();
      else if (url.pathname === "/api/quota") body = url.searchParams.has("detail") ? createQuotaDetail(data, url.searchParams.get("period"), now).finish() : quotaMetadata(data);
      else if (url.pathname === "/api/usage") body = data;
      else { response.writeHead(404).end(); return; }
      response.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(body)); return;
    }
    const file = path.resolve(source, "." + (url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname)));
    if (!file.startsWith(source + path.sep)) { response.writeHead(404).end(); return; }
    const content = await readFile(file);
    response.writeHead(200, { "Content-Type": mime[path.extname(file)] || "application/octet-stream" }).end(content);
  } catch (error) { response.writeHead(500).end(error.message); }
});

await mkdir(output, { recursive: true });
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
let browser;
const checks = [], errors = [];
try {
  browser = await chromium.launch({ headless: true, channel: "chrome" });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, locale: "fr-FR", timezoneId: "Europe/Paris", reducedMotion: "reduce", serviceWorkers: "block" });
  await context.addInitScript(() => localStorage.setItem("codex-usage-language", "fr"));
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (response.status() >= 400) errors.push(`${response.status()} ${new URL(response.url()).pathname}`); });
  await page.clock.setFixedTime(now);
  const base = `http://127.0.0.1:${server.address().port}`;
  await page.goto(`${base}/#quota`);
  await page.locator(".quota-projected-line").waitFor();
  const rows = page.locator(".forecast-goal-row"), markers = page.locator(".quota-goal-marker");
  async function saveGoal(name, date) {
    await page.locator("#addForecastGoal").click();
    await page.locator("#forecastGoalName").fill(name);
    await page.locator("#forecastGoalDate").fill(date);
    await page.locator("#forecastGoalForm button[type=submit]").click();
    assert.equal(await page.locator("#forecastGoalForm").isVisible(), false);
  }
  await saveGoal("Reset à utiliser avant", "2026-10-29T20:00");
  assert.equal(await markers.count(), 1);
  assert.match(await rows.first().innerText(), /80 %/);
  assert.match(await rows.first().innerText(), /20:00 UTC/);
  assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key))[0].at, FORECAST_GOALS_KEY), "2026-10-29T20:00:00.000Z");
  checks.push("October 29 at 20:00 UTC persists correctly in Europe/Paris and forecasts 80%");
  await saveGoal("Livraison du projet", "2026-10-30T12:00");
  await saveGoal("Objectif suivant", "2026-11-05T20:00");
  assert.equal(await markers.count(), 2);
  assert.equal(await rows.count(), 3);
  assert.match(await rows.last().innerText(), /Hors de la période affichée/);
  const marker = await markers.first().locator("line").evaluate(line => ({ x: +line.getAttribute("x1"), width: +line.ownerSVGElement.viewBox.baseVal.width }));
  assert.ok(Math.abs(marker.x - (62 + (marker.width - 84) * 4 / 7)) < .01);
  checks.push("Multiple dates: aligned vertical guides, curve points, outside-period status");
  await page.reload();
  await page.locator(".quota-projected-line").waitFor();
  assert.equal(await rows.count(), 3);
  await rows.nth(1).getByRole("button", { name: /^Modifier/ }).click();
  await page.locator("#forecastGoalDate").fill("2026-10-31T20:00");
  await page.locator("#forecastGoalForm button[type=submit]").click();
  assert.match(await rows.nth(1).innerText(), /120 %/);
  await page.locator("#quotaForecastGoals").scrollIntoViewIfNeeded();
  await page.locator(".quota-forecast-panel").screenshot({ path: path.join(output, "desktop.png") });
  checks.push("Reload, edit deadline, and over-limit forecast at 120%");
  // Keep an in-progress draft intact across the same resize rerender used by polling.
  await page.locator("#addForecastGoal").click();
  await page.locator("#forecastGoalName").fill("Brouillon conservé");
  await page.locator("#forecastGoalDate").fill("2026-10-30T10:30");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  assert.equal(await page.locator("#forecastGoalName").inputValue(), "Brouillon conservé");
  assert.equal(await page.locator("#forecastGoalDate").inputValue(), "2026-10-30T10:30");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  assert.equal(overflow, false);
  await page.locator(".quota-forecast-panel").screenshot({ path: path.join(output, "mobile.png") });
  await page.locator("#cancelForecastGoal").click();
  await rows.last().getByRole("button", { name: /^Supprimer/ }).click();
  assert.equal(await rows.count(), 2);
  await page.reload();
  await page.locator(".quota-projected-line").waitFor();
  assert.equal(await rows.count(), 2);
  checks.push("Mobile 390px: no horizontal overflow, draft preserved, cancel and persistent deletion");
  await saveGoal('<img src=x onerror="alert(1)">', "2026-10-29T20:00");
  assert.equal(await page.locator("#forecastGoalList img").count(), 0);
  assert.equal(await markers.count(), 3);
  const badgeRows = await markers.locator(".quota-goal-badge").evaluateAll(badges => badges.map(el => +el.getAttribute("cy")));
  assert.notEqual(badgeRows[0], badgeRows[1]);
  checks.push("HTML names rendered as text, identical deadlines get separate numbered badges");
  // Force a denied persistence write without affecting existing saved goals.
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException("Denied", "QuotaExceededError"); }; });
  await rows.first().getByRole("button", { name: /^Supprimer/ }).click();
  assert.equal(await rows.count(), 3);
  assert.equal(await page.locator("#forecastGoalError").isVisible(), true);
  checks.push("Denied storage writes are reported and preserve existing goals");
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, "result.json"), JSON.stringify({ scenarioTime: now.toISOString(), synthetic: true, source, checks, errors, captures: ["desktop.png", "mobile.png"] }, null, 2) + "\n");
  console.log(JSON.stringify({ passed: checks.length, checks, errors, output }, null, 2));
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
