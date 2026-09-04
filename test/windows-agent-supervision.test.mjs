import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  generateWindowsSupervisor,
  preserveExistingAgentState,
  supervisorMutexName,
  writeWindowsSupervisor,
} from "../src/windows-agent-supervision.mjs";

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const csc = path.join(process.env.SystemRoot || "", "Microsoft.NET", process.arch === "x64" ? "Framework64" : "Framework", "v4.0.30319", "csc.exe");
function buildHeadlessHost(output) {
  const result = spawnSync(csc, ["/nologo", "/target:winexe", "/optimize+", `/out:${output}`, path.join(projectRoot, "scripts", "windows", "HeadlessHost.cs"), path.join(projectRoot, "scripts", "windows", "WindowProbe.cs")], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test("Windows supervisor generation embeds safe paths and restart guarantees without enrollment secrets", () => {
  const script = generateWindowsSupervisor({
    repoRoot: "C:\\Users\\O'Brien\\codex_usage",
    statePath: "C:\\Users\\O'Brien\\AppData\\Local\\CodexUsageMesh\\state\\mesh-agent.json",
    nodePath: "C:\\Program Files\\nodejs\\node.exe",
    logPath: "C:\\Users\\O'Brien\\AppData\\Local\\CodexUsageMesh\\logs\\supervisor.log",
    taskName: "CodexUsageMesh",
    restartDelaySeconds: 30,
  });

  assert.match(script, /O''Brien/);
  assert.match(script, /System\.Text\.UTF8Encoding\(\$false\)/);
  assert.match(script, /try \{ \[Console\]::OutputEncoding = \$Utf8NoBom \} catch \{\}/);
  assert.match(script, /exitCode=\$exitCode/);
  assert.match(script, /restartAttempt=\$restartAttempt/);
  assert.match(script, /Start-Sleep -Seconds \$RestartDelaySeconds/);
  assert.match(script, /WaitOne\(0, \$false\)/);
  assert.match(script, /\$env:MESH_HUB_URL = \$null/);
  assert.match(script, /\$env:MESH_ENROLLMENT_CODE = \$null/);
  assert.doesNotMatch(script, /AAAA-BBBB|--associate/);
  assert.equal(supervisorMutexName("CodexUsageMesh"), supervisorMutexName("CodexUsageMesh"));
});

test("existing Mesh state is copied once and never overwritten during an update", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-windows-state-"));
  const sourcePath = path.join(directory, "legacy", "mesh-agent.json");
  const destinationPath = path.join(directory, "installed", "state", "mesh-agent.json");
  const sourceState = JSON.stringify({
    nodeId: "node-existing",
    alias: "WINDOWS-LAPTOP",
    sequence: 42,
    lastSyncAt: "2026-08-25T07:30:00.000Z",
    privateKey: "private-existing",
    hubUrl: "https://mesh.example",
  });
  const installedState = JSON.stringify({ nodeId: "node-installed", privateKey: "private-installed", hubUrl: "https://mesh.example" });

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await writeFile(sourcePath, sourceState, "utf8");

  const first = await preserveExistingAgentState({ sourcePath, destinationPath });
  assert.equal(first.status, "copied");
  assert.equal(await readFile(destinationPath, "utf8"), sourceState);
  assert.equal(await readFile(sourcePath, "utf8"), sourceState);

  await writeFile(destinationPath, installedState, "utf8");
  await writeFile(sourcePath, JSON.stringify({ nodeId: "node-new-source" }), "utf8");
  const update = await preserveExistingAgentState({ sourcePath, destinationPath });
  assert.equal(update.status, "existing");
  assert.equal(await readFile(destinationPath, "utf8"), installedState);
});

test("Windows installer migrates the previous supervised state without publishing owner-specific examples", async () => {
  const installer = await readFile(new URL("../scripts/windows/Install-CodexUsageMesh.ps1", import.meta.url), "utf8");
  const documentation = await readFile(new URL("../docs/windows-agent.md", import.meta.url), "utf8");

  assert.match(installer, /previousInstalledStatePath = Join-Path \$resolvedInstall 'state\\mesh-agent\.json'/);
  assert.match(installer, /Test-Path -LiteralPath \$previousInstalledStatePath -PathType Leaf/);
  assert.match(installer, /LegacyStatePath = \$legacyStatePath/);
  assert.match(documentation, /https:\/\/your-mesh-ingress\.example/);
  assert.doesNotMatch(documentation, /capitainegreenpearl/);
});

test("Windows supervisor logs a non-zero exit and restarts the agent once", { skip: process.platform !== "win32" }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-windows-restart-"));
  const launcherPath = path.join(directory, "supervisor.ps1");
  const headlessHostPath = path.join(directory, "host.exe");
  const hostLogPath = path.join(directory, "host.log");
  buildHeadlessHost(headlessHostPath);
  const statePath = path.join(directory, "state", "mesh-agent.json");
  const logPath = path.join(directory, "logs", "supervisor.log");
  const counterPath = path.join(directory, "launch-count.txt");
  await mkdir(path.dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify({
    nodeId: "node-test",
    alias: "Test Windows",
    hubUrl: "https://mesh.example",
    privateKey: "test-private-key",
  }), "utf8");
  await writeFile(path.join(directory, "agent.mjs"), `
import { readFile, writeFile } from "node:fs/promises";
const counterPath = ${JSON.stringify(counterPath)};
let count = 0;
try { count = Number(await readFile(counterPath, "utf8")); } catch {}
count += 1;
await writeFile(counterPath, String(count), "utf8");
console.log(\`dummy launch \${count}\`);
process.exit(count === 1 ? 1 : 0);
`, "utf8");
  await writeWindowsSupervisor(launcherPath, {
    repoRoot: directory,
    statePath,
    nodePath: process.execPath,
    logPath,
    taskName: `CodexUsageMesh-Test-${process.pid}`,
    restartDelaySeconds: 1,
    headlessHostPath,
  });

  const result = spawnSync(headlessHostPath, [launcherPath, hostLogPath], {
    encoding: "utf8",
    timeout: 10_000,
    windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(await readFile(counterPath, "utf8"), "2");
  const log = await readFile(logPath, "utf8");
  assert.match(log, /^\[\d{4}-\d{2}-\d{2}T/m);
  assert.match(log, /agent exited; exitCode=1/);
  assert.match(log, /agent restart scheduled; restartAttempt=1; nextLaunchAttempt=2; delaySeconds=1/);
  assert.match(log, /agent launch; attempt=2/);
  assert.match(log, /agent exited; exitCode=0/);
});

test("Windows task hides its console and recovers indefinitely without overlapping agents", { skip: process.platform !== "win32" }, async () => {
  // Windows CI can expose TEMP through an 8.3 alias that .NET expands to its long path.
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), "codex-windows-task-")));
  const probePath = path.join(directory, "inspect-task.ps1");
  const installerPath = new URL("../scripts/windows/Install-CodexUsageMesh.ps1", import.meta.url);
  const literal = (value) => `'${value.replaceAll("'", "''")}'`;
  await writeFile(probePath, `
. ${literal(fileURLToPath(installerPath))} -RepoRoot ${literal(directory)}
$configuration = Resolve-Configuration
[xml]$task = New-TaskXml $configuration
[pscustomobject]@{
  Command = [string]$task.Task.Actions.Exec.Command
  Arguments = [string]$task.Task.Actions.Exec.Arguments
  LogonUser = [string]$task.Task.Triggers.LogonTrigger.UserId
  ResumeEvent = [string]$task.Task.Triggers.EventTrigger.Subscription
  RecoveryInterval = [string]$task.Task.Triggers.TimeTrigger.Repetition.Interval
  DurationElementCount = $task.Task.Triggers.TimeTrigger.Repetition.GetElementsByTagName('Duration').Count
  StopAtDurationEnd = [string]$task.Task.Triggers.TimeTrigger.Repetition.StopAtDurationEnd
  RecoveryEnabled = [string]$task.Task.Triggers.TimeTrigger.Enabled
  RecoveryStart = [string]$task.Task.Triggers.TimeTrigger.StartBoundary
  MultipleInstances = [string]$task.Task.Settings.MultipleInstancesPolicy
  ExecutionTimeLimit = [string]$task.Task.Settings.ExecutionTimeLimit
  LogPath = $configuration.LogPath
  StatePath = $configuration.StatePath
  HeadlessHostPath = $configuration.HeadlessHostPath
  HostLogPath = $configuration.HostLogPath
} | ConvertTo-Json -Compress
`, "utf8");
  const powershell = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const before = Date.now();
  const result = spawnSync(powershell, ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", probePath], {
    encoding: "utf8", timeout: 10_000, windowsHide: true,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  const task = JSON.parse(result.stdout);
  assert.equal(task.Command, task.HeadlessHostPath);
  assert.equal(task.Arguments, `"${path.join(directory, ".cache", "windows-agent", "CodexUsageMesh.Supervisor.ps1")}" "${task.HostLogPath}"`);
  assert.doesNotMatch(task.Arguments, /powershell|-WindowStyle/i);
  assert.match(task.LogonUser, /^S-1-/);
  assert.match(task.ResumeEvent, /Microsoft-Windows-Power-Troubleshooter/);
  assert.equal(task.RecoveryInterval, "PT1M");
  assert.equal(task.DurationElementCount, 0);
  assert.equal(task.StopAtDurationEnd, "false");
  assert.equal(task.RecoveryEnabled, "true");
  assert.ok(Date.parse(task.RecoveryStart) >= before + 55_000);
  assert.ok(Date.parse(task.RecoveryStart) <= Date.now() + 61_000);
  assert.equal(task.MultipleInstances, "IgnoreNew");
  assert.equal(task.ExecutionTimeLimit, "PT0S");
  assert.equal(task.LogPath, path.join(directory, ".cache", "windows-agent", "CodexUsageMesh.Supervisor.log"));
  assert.equal(task.StatePath, path.join(process.env.LOCALAPPDATA, "CodexUsageMesh", "mesh-agent.windows.json"));
});

test("Windows recovery waits for a surviving child and does not treat stderr as an agent crash", { skip: process.platform !== "win32", timeout: 20_000 }, async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-windows-orphan-"));
  const statePath = path.join(directory, "mesh-agent.json");
  const logPath = path.join(directory, "supervisor.log");
  const launcherPath = path.join(directory, "supervisor.ps1");
  const headlessHostPath = path.join(directory, "host.exe");
  const hostLogPath = path.join(directory, "host.log");
  buildHeadlessHost(headlessHostPath);
  const agentPath = path.join(directory, "agent.mjs");
  const launchesPath = path.join(directory, "launches.jsonl");
  await writeFile(statePath, JSON.stringify({ nodeId: "test", privateKey: "test", hubUrl: "https://mesh.example", alias: "Test" }));
  await writeFile(agentPath, `
import { appendFileSync, readFileSync } from "node:fs";
const file = ${JSON.stringify(launchesPath)};
appendFileSync(file, JSON.stringify({ pid: process.pid }) + "\\n");
const count = readFileSync(file, "utf8").trim().split("\\n").length;
if (count === 1) setInterval(() => {}, 1000);
else { console.error("expected stderr from agent"); process.exit(0); }
`);
  await writeWindowsSupervisor(launcherPath, { repoRoot: directory, statePath, nodePath: process.execPath, logPath,
    headlessHostPath, taskName: `CodexUsageMesh-Orphan-${process.pid}`, restartDelaySeconds: 1 });
  async function waitFor(check) {
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.fail("Expected supervisor transition did not occur");
  }
  const readLog = () => readFile(logPath, "utf8").catch(() => "");
  const readLaunches = async () => (await readFile(launchesPath, "utf8").catch(() => "")).trim().split("\n").filter(Boolean).map(JSON.parse);
  const survivor = spawn(process.execPath, [agentPath, "--state-path", statePath], { stdio: "ignore", windowsHide: true });
  let supervisor;
  try {
    await waitFor(async () => (await readLaunches()).length === 1);
    supervisor = spawn(headlessHostPath, [launcherPath, hostLogPath], { stdio: "ignore", windowsHide: true });
    await waitFor(async () => (await readLog()).includes("existing agent still running; launch deferred"));
    assert.equal((await readLaunches()).length, 1, "Recovery must not start a competing state writer");
    survivor.kill();
    await waitFor(async () => (await readLog()).includes("agent exited; exitCode=0"));
    assert.equal((await readLaunches()).length, 2);
    const log = await readLog();
    assert.match(log, /expected stderr from agent/);
    assert.doesNotMatch(log, /agent invocation failed/);
    await waitFor(async () => supervisor.exitCode !== null);
    assert.equal(supervisor.exitCode, 0);
  } finally {
    survivor.kill();
    supervisor?.kill();
  }
});
