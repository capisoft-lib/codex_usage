import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

async function availablePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForServer(url, child) {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (child.exitCode != null) throw new Error(`Le serveur local s’est arrêté avec le code ${child.exitCode}.`);
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch { /* The process may still be starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Le serveur local ne devient pas disponible.");
}

function outputOf(child) {
  let stdout = "", stderr = "";
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

test("local HTTP adapter serves the generated UI and common API", async () => {
  const fixtureRoot = await mkdtemp(path.join(tmpdir(), "codex-usage-http-"));
  const sessions = path.join(fixtureRoot, "sessions");
  const archives = path.join(fixtureRoot, "archived_sessions");
  const index = path.join(fixtureRoot, "session_index.jsonl");
  await Promise.all([mkdir(sessions), mkdir(archives), writeFile(index, "", "utf8")]);
  const port = await availablePort();
  const projectRoot = fileURLToPath(new URL("..", import.meta.url));
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot,
    windowsHide: true,
    stdio: "ignore",
    env: {
      ...process.env,
      CODEX_SOURCE_MODE: "scoped",
      CODEX_SESSIONS_PATH: sessions,
      CODEX_ARCHIVED_SESSIONS_PATH: archives,
      CODEX_SESSION_INDEX_PATH: index,
      SNAPSHOT_PATH: "",
      MESH_HUB_URL: "",
      HOST: "127.0.0.1",
      PORT: String(port),
    },
  });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForServer(`${baseUrl}/api/health`, child);
    const [capabilities, usage, html, manifestResponse, iconResponse, themesResponse] = await Promise.all([
      fetch(`${baseUrl}/api/capabilities`).then((response) => response.json()),
      fetch(`${baseUrl}/api/usage?source=local`).then((response) => response.json()),
      fetch(`${baseUrl}/`).then((response) => response.text()),
      fetch(`${baseUrl}/manifest.webmanifest`),
      fetch(`${baseUrl}/icon-192.png`),
      fetch(`${baseUrl}/themes.js`),
    ]);
    assert.equal(capabilities.runtime, "local");
    assert.deepEqual(capabilities.sources, ["local"]);
    assert.equal(usage.apiVersion, 1);
    assert.deepEqual(usage.sessions, []);
    const pageUrl = `${baseUrl}/api/page?${new URLSearchParams({source:'local',query:JSON.stringify({view:'settings'})})}`;
    const pageResponse = await fetch(pageUrl);
    assert.equal(pageResponse.status, 200);
    const pageData = await pageResponse.json();
    assert.equal(pageData.pageOnly, true);
    assert.deepEqual(pageData.sessions, []);
    assert.equal((await fetch(pageUrl,{headers:{'If-None-Match':`W/${pageResponse.headers.get('etag')}`}})).status,304);
    const quotaResponse = await fetch(`${baseUrl}/api/quota?source=local`);
    assert.equal(quotaResponse.status, 200);
    const quota = await quotaResponse.json();
    assert.equal(quota.quotaOnly, true);
    assert.deepEqual(quota.sessions, []);
    assert.equal(quota.sessionCount, 0);
    const unchangedQuota = await fetch(`${baseUrl}/api/quota?source=local`, { headers: { "If-None-Match": quotaResponse.headers.get("etag") } });
    assert.equal(unchangedQuota.status, 304);
    const quotaDetails = await fetch(`${baseUrl}/api/quota?source=local&detail=1`).then((response) => response.json());
    assert.ok(quotaDetails.quotaDetail.forecast);
    assert.deepEqual(quotaDetails.sessions[0].calls, []);
    assert.equal((await fetch(`${baseUrl}/api/quota?source=invalid`)).status, 400);
    assert.match(html, /Hebdomadaire/);
    assert.match(manifestResponse.headers.get("content-type") ?? "", /^application\/manifest\+json\b/i);
    assert.match(iconResponse.headers.get("content-type") ?? "", /^image\/png\b/i);
    assert.equal(themesResponse.status, 200);
    assert.match(themesResponse.headers.get("content-type") ?? "", /javascript/);
    assert.match(await themesResponse.text(), /CodexUsageThemes/);

    const occupied = net.createServer();
    await new Promise((resolve, reject) => occupied.once("error", reject).listen(0, "127.0.0.1", resolve));
    const occupiedPort = occupied.address().port;
    try {
      const { NO_COLOR: _noColor, ...blockedEnv } = process.env;
      const blocked = spawn(process.execPath, ["server.mjs"], {
        cwd: projectRoot,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...blockedEnv, FORCE_COLOR: "1", LANG: "C.UTF-8", LANGUAGE: "", HOST: "127.0.0.1", PORT: String(occupiedPort),
          CODEX_SOURCE_MODE: "scoped", CODEX_SESSIONS_PATH: sessions, CODEX_ARCHIVED_SESSIONS_PATH: archives,
          CODEX_SESSION_INDEX_PATH: index, SNAPSHOT_PATH: "", MESH_HUB_URL: "" },
      });
      const blockedResult = await outputOf(blocked);
      assert.equal(blockedResult.code, 1);
      assert.equal(blockedResult.signal, null);
      assert.match(blockedResult.stderr, /\u001b\[1;31mAddress already in use!\u001b\[0m/);
      assert.match(blockedResult.stderr, new RegExp(`http://127\\.0\\.0\\.1:${occupiedPort}`));
      assert.doesNotMatch(blockedResult.stderr, /dashboard (?:is )?(?:already )?running|open it|EADDRINUSE|node:events/i);
    } finally {
      await new Promise((resolve, reject) => occupied.close((error) => error ? reject(error) : resolve()));
    }
  } finally {
    child.kill();
    await Promise.race([
      new Promise((resolve) => child.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    await rm(fixtureRoot, { recursive: true, force: true });
  }
});
