import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import test from "node:test";
import { _electron as electron } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const executablePath = createRequire(import.meta.url)("electron");
async function freePort() {
  const listener = createServer();
  listener.listen(0, "127.0.0.1");
  await once(listener, "listening");
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  return port;
}
async function eventually(check) {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Condition did not become true");
}
async function setup() {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mini-smoke-"));
  const port = await freePort();
  await mkdir(path.join(directory, "sessions"));
  await mkdir(path.join(directory, "archived"));
  await writeFile(path.join(directory, "index.jsonl"), "");
  const env = { ...process.env, HOST: "127.0.0.1", PORT: String(port),
    CODEX_HOME: directory, CODEX_SOURCE_MODE: "scoped", CODEX_SESSIONS_PATH: path.join(directory, "sessions"),
    CODEX_ARCHIVED_SESSIONS_PATH: path.join(directory, "archived"), CODEX_SESSION_INDEX_PATH: path.join(directory, "index.jsonl"),
    SNAPSHOT_PATH: path.join(directory, "snapshot.json"), MESH_HUB_URL: "", DASHBOARD_MODE: "local" };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.CODEX_DESKTOP_HELPER;
  delete env.DASHBOARD_URL;
  delete env.DASHBOARD_ACCESS_TOKEN;
  return { directory, env, url: `http://127.0.0.1:${port}` };
}
async function launch(fixture) {
  console.log("Launching desktop smoke fixture");
  const application = await electron.launch({ executablePath, args: [path.join(root, "desktop"), `--user-data-dir=${path.join(fixture.directory, "profile")}`], env: fixture.env, timeout: 30_000 });
  application.context().setDefaultTimeout(10_000);
  application.process().stderr.on("data", (chunk) => { if (process.env.CI) process.stderr.write(chunk); });
  return application;
}
async function closeApplication(application) {
  let timeout;
  try {
    await Promise.race([application.close(), new Promise((_, reject) => {
      timeout = setTimeout(() => { application.process().kill(); reject(new Error("Desktop did not close within 15 seconds")); }, 15_000);
    })]);
  } finally { clearTimeout(timeout); }
}
async function menuClick(application, label, childLabel) {
  await application.evaluate(({ Menu }, { label, childLabel }) => {
    const items = Menu.getApplicationMenu().items[0].submenu.items;
    const item = items.find((item) => item.label === label);
    (childLabel ? item.submenu.items.find((item) => item.label === childLabel) : item).click();
  }, { label, childLabel });
}

test("native window, preferences, network errors, reopen and owned-server shutdown", { timeout: 90_000 }, async () => {
  const fixture = await setup();
  const application = await launch(fixture);
  let closed = false;
  try {
    const page = await application.firstWindow({ timeout: 15_000 });
    console.log("Native window created");
    await page.clock.install();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.waitForSelector("#miniStatus");
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
    const capabilities = await fetch(`${fixture.url}/api/capabilities`).then((r) => r.json());
    assert.equal(capabilities.desktopHelper, true);
    assert.equal((await fetch(`${fixture.url}/api/desktop/mini`, { method: "POST" })).status, 403);
    assert.equal((await fetch(`${fixture.url}/api/desktop/mini`, { method: "POST", headers: { "X-Codex-Desktop": "1", Origin: "https://other.example" } })).status, 403);
    let offline = false;
    const requests = [];
    await page.route("**/api/capabilities", (route) => route.fulfill({ json: { apiVersion: 1, sources: ["local", "centralized"], defaultSource: "local" } }));
    await page.route("**/api/usage?**", (route) => {
      requests.push(new URL(route.request().url()).searchParams.get("source"));
      if (offline) return route.fulfill({ status: 503, body: "offline" });
      return route.fulfill({ json: { generatedAt: new Date().toISOString(),
        fiveHourQuota: { remainingPercent: 42, resetsAt: new Date(Date.now() + 3600_000).toISOString(), observedAt: new Date().toISOString() },
        weeklyQuota: { remainingPercent: 76, resetsAt: new Date(Date.now() + 86400_000).toISOString(), observedAt: new Date().toISOString() } } });
    });
    assert.equal((await fetch(`${fixture.url}/api/desktop/mini?source=centralized&language=fr&theme=blue&fiveHour=1&weekly=1`, { method: "POST", headers: { "X-Codex-Desktop": "1" } })).status, 202);
    await page.waitForURL(/source=centralized/);
    await page.waitForFunction(() => document.querySelector("[data-remaining]").textContent === "42%", null, { polling: 100, timeout: 10_000 });
    console.log("Native data rendered");
    assert.equal(requests.at(-1), "centralized");
    assert.equal(await page.locator("html").getAttribute("lang"), "fr");
    assert.equal(await page.locator("html").getAttribute("data-theme"), "blue");
    await page.screenshot({ path: path.join(fixture.directory, "both-fr-blue.png") });
    const layout = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, width: innerWidth }));
    assert.ok(layout.scroll <= layout.width);
    offline = true;
    await page.clock.runFor(15_000);
    await page.waitForFunction(() => document.querySelector("#miniStatus").textContent.includes("Connexion perdue"), null, { polling: 100, timeout: 10_000 });
    assert.equal(await page.locator("[data-remaining]").first().textContent(), "42%");
    await page.screenshot({ path: path.join(fixture.directory, "offline.png") });
    offline = false;
    await page.clock.runFor(15_000);
    await page.waitForFunction(() => !document.querySelector("#miniStatus").textContent.includes("Connexion perdue"), null, { polling: 100, timeout: 10_000 });
    await menuClick(application, "Visible quotas", "Weekly");
    await page.waitForFunction(() => document.querySelector("[data-quota='five-hour']").hidden, null, { polling: 100, timeout: 10_000 });
    await page.screenshot({ path: path.join(fixture.directory, "weekly.png") });
    assert.deepEqual(errors, []);
    await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].close());
    await eventually(async () => (await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 0);
    await menuClick(application, "Open mini quota window");
    await eventually(async () => (await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length)) === 1);
    await closeApplication(application); closed = true;
    await eventually(async () => { try { await fetch(`${fixture.url}/api/health`); return false; } catch { return true; } });
    console.log(`Native screenshots: ${fixture.directory}`);
  } finally { if (!closed) await closeApplication(application); }
});

test("remote API works without a hosted mini page or a local collector, rejects arbitrary IPC endpoints", { timeout: 60_000 }, async () => {
  const fixture = await setup();
  const requests = [];
  const server = createHttpServer((request, response) => {
    requests.push(request.url);
    response.setHeader("Content-Type", "application/json");
    if (request.url === "/dashboard/api/capabilities") response.end(JSON.stringify({ apiVersion: 1, sources: ["centralized"], defaultSource: "centralized" }));
    else if (request.url === "/dashboard/api/usage?source=centralized") response.end(JSON.stringify({
      theme: "blue", generatedAt: new Date().toISOString(), weeklyQuota: { remainingPercent: 64, resetsAt: new Date(Date.now() + 86400_000).toISOString() },
      fiveHourQuota: { remainingPercent: 82, resetsAt: new Date(Date.now() + 3600_000).toISOString() },
      sessions: [{ title: "Never sent to the renderer" }],
    }));
    else { response.writeHead(404); response.end('{}'); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  fixture.env.DASHBOARD_URL = `http://127.0.0.1:${server.address().port}/dashboard/`;
  const application = await launch(fixture);
  try {
    const page = await application.firstWindow({ timeout: 15_000 });
    assert.match(page.url(), /^file:/);
    await page.waitForFunction(() => document.querySelector("[data-remaining]").textContent === "82%", null, { polling: 100 });
    const data = await page.evaluate(() => window.CodexDesktop.request("usage?source=centralized"));
    assert.equal(data.data.sessions, undefined);
    assert.equal(data.data.weeklyQuota.remainingPercent, 64);
    assert.equal(data.data.theme, "blue");
    await page.waitForFunction(() => document.documentElement.dataset.theme === "blue");
    await assert.rejects(page.evaluate(() => window.CodexDesktop.request("../admin")));
    assert.ok(requests.every((url) => url.startsWith("/dashboard/api/")));
    await assert.rejects(fetch(`${fixture.url}/api/health`));
    assert.equal(await application.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].isAlwaysOnTop()), true);
  } finally {
    await closeApplication(application);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test("desktop reuses an independent server and leaves it running on quit", { timeout: 60_000 }, async () => {
  const fixture = await setup();
  const server = spawn(process.execPath, [path.join(root, "server.mjs")], { env: fixture.env, cwd: root, stdio: "ignore", windowsHide: true });
  let application;
  try {
    await eventually(async () => { try { return (await fetch(`${fixture.url}/api/capabilities`)).ok; } catch { return false; } });
    application = await launch(fixture);
    await application.firstWindow({ timeout: 15_000 });
    assert.equal((await fetch(`${fixture.url}/api/capabilities`).then((r) => r.json())).desktopHelper, false);
    await closeApplication(application); application = null;
    assert.equal((await fetch(`${fixture.url}/api/health`)).ok, true);
    assert.equal(server.exitCode, null);
  } finally {
    if (application) await closeApplication(application);
    const exited = once(server, "exit");
    server.kill();
    await exited;
  }
});

test("private hub association signs reads, survives restart and clears revoked quotas", { timeout: 90_000 }, async () => {
  const { MeshHubStore } = await import("../src/mesh-hub-store.mjs");
  const hub = new MeshHubStore();
  const enrollment = await hub.createEnrollment();
  const fixture = await setup();
  const requests = [];
  const server = createHttpServer(async (request, response) => {
    requests.push(request.url);
    response.setHeader("Content-Type", "application/json");
    try {
      let raw = "";
      for await (const chunk of request) raw += chunk;
      const body = raw ? JSON.parse(raw) : {};
      if (request.url === "/api/mesh/enroll") response.end(JSON.stringify(await hub.enroll(body)));
      else if (request.url === "/api/mesh/usage") {
        await hub.readUsage(body);
        response.end(JSON.stringify({ theme: "blue", generatedAt: new Date().toISOString(),
          fiveHourQuota: { remainingPercent: 37, resetsAt: new Date(Date.now() + 3600_000).toISOString() },
          weeklyQuota: { remainingPercent: 61, resetsAt: new Date(Date.now() + 86400_000).toISOString() },
          sessions: [{ title: "Private conversation" }],
        }));
      } else { response.writeHead(401); response.end('{}'); }
    } catch (error) { response.writeHead(error.status || 500); response.end(JSON.stringify({ error: error.message })); }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  fixture.env.DASHBOARD_URL = `http://127.0.0.1:${server.address().port}/`;
  let application;
  try {
    application = await launch(fixture);
    let page = await application.firstWindow();
    await page.waitForFunction(() => !document.querySelector("#miniSignIn").hidden, null, { polling: 100 });
    await page.locator("#miniAccessTitle").click();
    await page.waitForFunction(() => innerHeight >= 500, null, { polling: 100, timeout: 3000 });
    await page.locator("#miniHubUrl").fill(fixture.env.DASHBOARD_URL);
    await page.locator("#miniAssociationCode").fill(enrollment.code);
    await page.locator("#miniSaveAccess").click();
    await page.waitForFunction(() => document.querySelector("[data-remaining]").textContent === "37%", null, { polling: 100 });
    assert.equal(await page.locator("#miniAssociationCode").inputValue(), "");
    const result = await page.evaluate(() => window.CodexDesktop.request("usage?source=centralized"));
    assert.equal(result.data.sessions, undefined);
    await page.waitForFunction(() => document.documentElement.dataset.theme === "blue");
    await page.screenshot({ path: path.join(fixture.directory, "associated-blue.png") });
    const nodeId = hub.nodes()[0].id;
    const sequence = hub.state.nodes[nodeId].lastSequence;
    await closeApplication(application); application = null;
    application = await launch(fixture);
    page = await application.firstWindow();
    await page.waitForFunction(() => document.querySelector("[data-remaining]").textContent === "37%", null, { polling: 100 });
    assert.equal(hub.nodes().length, 1);
    assert.ok(hub.state.nodes[nodeId].lastSequence > sequence);
    assert.ok(!requests.includes("/api/mesh/ingest"));
    await assert.rejects(fetch(`${fixture.url}/api/health`));
    await hub.revokeNode(nodeId);
    await page.reload();
    await page.waitForFunction(() => !document.querySelector("#miniSignIn").hidden, null, { polling: 100 });
    assert.equal(await page.locator("[data-remaining]").first().textContent(), "—");
    await page.screenshot({ path: path.join(fixture.directory, "association-required.png") });
    console.log(`Association screenshots: ${fixture.directory}`);
  } finally {
    if (application) await closeApplication(application);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});
