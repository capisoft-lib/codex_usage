import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const installerPath = fileURLToPath(new URL("../scripts/windows/Install-CodexUsageMesh.ps1", import.meta.url));
const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const shells = [
  ["Windows PowerShell 5.1", path.join(process.env.SystemRoot || "", "System32", "WindowsPowerShell", "v1.0", "powershell.exe")],
  ["PowerShell 7", path.join(process.env.ProgramFiles || "", "PowerShell", "7", "pwsh.exe")],
];

async function diagnose(shell, hubUrl, { enrolled = true, recent = true, agentCount = 1 } = {}) {
  // Only the local task/process/state inputs are synthetic. Execute the actual
  // diagnostic and Invoke-WebRequest against an ephemeral loopback HTTP server.
  const command = `
. ${literal(installerPath)} -Action Diagnose -TaskName CodexUsageMesh-DiagnosticTest
function Get-ScheduledTask {
  [pscustomobject]@{ State = 'Running'; Actions = @([pscustomobject]@{ Arguments = '-WindowStyle Hidden' }) }
}
function Get-ScheduledTaskInfo { [pscustomobject]@{ LastTaskResult = 0 } }
function Export-ScheduledTask {
  '<LogonTrigger></LogonTrigger><EventTrigger>Microsoft-Windows-Power-Troubleshooter</EventTrigger><TimeTrigger><Repetition><Interval>PT1M</Interval></Repetition></TimeTrigger>'
}
function Get-MatchingProcesses {
  [pscustomobject]@{ Supervisors = @(1); Agents = @(${agentCount === 1 ? "1" : ""}); InspectionError = $null }
}
function Read-AgentState {
  ${enrolled ? `[pscustomobject]@{ nodeId = 'test-node'; hubUrl = ${literal(hubUrl)}; lastSyncAt = [DateTimeOffset]::Now.AddMinutes(${recent ? "0" : "-10"}).ToString('o') }` : "return $null"}
}
$configuration = [pscustomobject]@{ StatePath = 'synthetic-state.json'; LogPath = 'synthetic-supervisor.log' }
Invoke-Diagnostic $configuration | ConvertTo-Json -Depth 5 -Compress
`;
  const { stdout } = await execFileAsync(shell, [
    "-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass",
    "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64"),
  ], { encoding: "utf8", timeout: 20_000, windowsHide: true }).catch((error) => {
    throw new Error(error.stderr || `PowerShell diagnostic failed: ${error.code}`);
  });
  return JSON.parse(stdout.trim());
}

async function startHub(t, routes) {
  const requests = [];
  const server = createServer((request, response) => {
    requests.push({ url: request.url, method: request.method, authorization: request.headers.authorization });
    const route = routes[request.url] ?? { status: 404 };
    if (route.disconnect) { request.socket.destroy(); return; }
    response.writeHead(route.status, { "Content-Type": "application/json", ...route.headers });
    response.end(JSON.stringify({ ok: route.status === 200 }));
  });
  await new Promise((resolve, reject) => server.once("error", reject).listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  });
  return { url: `http://127.0.0.1:${server.address().port}`, requests };
}

async function startSelfHostedHub(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-diagnostic-hub-"));
  let child;
  let closed;
  t.after(async () => {
    if (child) { child.kill(); await closed; }
    await rm(directory, { recursive: true, force: true });
  });
  const listener = createServer();
  await new Promise((resolve, reject) => listener.once("error", reject).listen(0, "127.0.0.1", resolve));
  const port = listener.address().port;
  await new Promise((resolve) => listener.close(resolve));
  child = spawn(process.execPath, ["server.mjs"], {
    cwd: projectRoot, windowsHide: true, stdio: "ignore",
    env: { ...process.env, DASHBOARD_MODE: "hub", MESH_HUB_PATH: path.join(directory, "hub.json"),
      MESH_ADMIN_TOKEN: "", HOST: "127.0.0.1", PORT: String(port) },
  });
  closed = once(child, "close");
  const url = `http://127.0.0.1:${port}`;
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    assert.equal(child.exitCode, null, "Self-hosted hub exited before becoming ready");
    const response = await fetch(`${url}/api/health`).catch(() => null);
    if (response?.ok) { await response.arrayBuffer(); return url; }
    if (response) await response.arrayBuffer();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.fail("Self-hosted hub did not become ready");
}

for (const [name, shell] of shells) {
  test(`Windows diagnostic HTTP health checks (${name})`, {
    skip: process.platform !== "win32" || (!existsSync(shell) && name === "PowerShell 7"),
    timeout: 90_000,
  }, async (t) => {
    const cases = [
      { name: "hosted ingress succeeds without a fallback", primary: 200, status: 200 },
      { name: "hosted ingress accepts other successful statuses", primary: 204, status: 204 },
      { name: "self-hosted hub falls back after 404", primary: 404, fallback: 200, status: 200 },
      { name: "self-hosted hub preserves a URL prefix and trailing slashes", prefix: "/mesh", trailing: "///", primary: 404, fallback: 200, status: 200 },
      { name: "both endpoints missing report the final 404", primary: 404, fallback: 404, status: 404 },
      { name: "unhealthy fallback reports its own error", primary: 404, fallback: 503, status: 503 },
      ...[401, 403, 500, 503].map((status) => ({ name: `primary ${status} is not hidden by a healthy fallback`, primary: status, status })),
      { name: "redirects are not followed or treated as healthy", primary: 302, status: 302, redirect: true },
      { name: "fallback redirects are not followed", primary: 404, fallback: 302, status: 302, redirect: true },
      { name: "transport failure does not fall back", disconnect: true, status: null },
      { name: "fallback transport failure clears the initial 404", primary: 404, fallbackDisconnect: true, status: null },
    ];
    for (const scenario of cases) {
      await t.test(scenario.name, async (t) => {
        const prefix = scenario.prefix || "";
        const primaryPath = `${prefix}/healthz`;
        const fallbackPath = `${prefix}/api/health`;
        const headers = scenario.redirect ? { Location: "/should-not-follow" } : {};
        const hub = await startHub(t, {
          [primaryPath]: { status: scenario.primary, disconnect: scenario.disconnect, headers },
          [fallbackPath]: { status: scenario.fallback ?? 200, disconnect: scenario.fallbackDisconnect, headers },
          "/should-not-follow": { status: 200 },
        });
        const diagnostic = await diagnose(shell, hub.url + prefix + (scenario.trailing || ""));
        const result = diagnostic.Result;
        const usedFallback = scenario.primary === 404;
        const reachable = scenario.status !== null && scenario.status >= 200 && scenario.status < 300;
        assert.equal(result.HubHealthUrl, hub.url + (usedFallback ? fallbackPath : primaryPath));
        // Windows PowerShell 5.1 exposes no response/status when redirecting is disabled.
        const expectedStatus = scenario.status === 302 && name === "Windows PowerShell 5.1" ? null : scenario.status;
        assert.equal(result.HubStatusCode, expectedStatus);
        assert.equal(result.HubReachable, reachable);
        assert.equal(diagnostic.Healthy, reachable);
        if (reachable) assert.equal(result.HubError, null, "Successful fallback must clear the original 404 error");
        else assert.ok(result.HubError, "Failed probes must preserve a useful error");
        const requestPaths = hub.requests.map((request) => request.url);
        // The underlying .NET HTTP client can retry a disconnected GET.
        const attemptedPaths = scenario.disconnect || scenario.fallbackDisconnect ? [...new Set(requestPaths)] : requestPaths;
        assert.deepEqual(attemptedPaths, usedFallback ? [primaryPath, fallbackPath] : [primaryPath]);
        for (const request of hub.requests) {
          assert.equal(request.method, "GET");
          assert.equal(request.authorization, undefined, "Health probes must not send credentials");
        }
      });
    }

    await t.test("real self-hosted hub is reachable without changing its routes", async (t) => {
      const url = await startSelfHostedHub(t);
      const missing = await fetch(`${url}/healthz`);
      assert.equal(missing.status, 404);
      await missing.arrayBuffer();
      const diagnostic = await diagnose(shell, url);
      assert.equal(diagnostic.Result.HubHealthUrl, `${url}/api/health`);
      assert.equal(diagnostic.Result.HubStatusCode, 200);
      assert.equal(diagnostic.Result.HubError, null);
      assert.equal(diagnostic.Result.HubReachable, true);
      assert.equal(diagnostic.Healthy, true);
    });

    await t.test("missing enrollment does not issue a health request", async (t) => {
      const hub = await startHub(t, {});
      const { Result: result, Healthy: healthy } = await diagnose(shell, hub.url, { enrolled: false });
      assert.equal(result.HubHealthUrl, null);
      assert.equal(result.HubStatusCode, null);
      assert.equal(result.HubError, null);
      assert.equal(result.HubReachable, false);
      assert.equal(healthy, false);
      assert.deepEqual(hub.requests, []);
    });

    for (const options of [{ recent: false }, { agentCount: 0 }]) {
      await t.test(`successful fallback does not override other failed checks: ${JSON.stringify(options)}`, async (t) => {
        const hub = await startHub(t, { "/api/health": { status: 200 } });
        const diagnostic = await diagnose(shell, hub.url, options);
        assert.equal(diagnostic.Result.HubReachable, true);
        assert.equal(diagnostic.Healthy, false);
      });
    }
  });
}
