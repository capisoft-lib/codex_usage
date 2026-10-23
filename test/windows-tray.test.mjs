import assert from "node:assert/strict";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const literal = (value) => `'${value.replaceAll("'", "''")}'`;
const root = fileURLToPath(new URL("..", import.meta.url));
const powershell = path.join(process.env.SystemRoot || "", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
const ps = (command) => execute(powershell, ["-NoProfile", "-NonInteractive", "-EncodedCommand", Buffer.from(command, "utf16le").toString("base64")], { windowsHide: true, timeout: 60_000 });

test("Windows notification health, private-state errors and task controls", { skip: process.platform !== "win32", timeout: 90_000 }, async (t) => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-tray-test-"));
  const cleanup = () => ps(String.raw`
$ErrorActionPreference = 'Stop'
$directory = ${literal(directory)}
$segment = '\' + [IO.Path]::GetFileName($directory) + '\TrayTests.exe'
# Task Scheduler stop is asynchronous. Match this unique test directory even
# when Windows expands RUNNER~1 to runneradmin in the process command line.
$workers = @(Get-CimInstance Win32_Process -Filter "Name='TrayTests.exe'" | Where-Object { $_.CommandLine -like ('*' + $segment + '*') })
foreach ($worker in $workers) {
  $process = Get-Process -Id $worker.ProcessId -ErrorAction SilentlyContinue
  if ($process -and -not $process.WaitForExit(10000)) { throw 'Owned tray test worker did not exit; files preserved' }
}
# Windows can retain the image mapping briefly after process exit. Retry only
# normal deletion, with a fixed bound; do not force attributes or ignore errors.
$deadline = [DateTime]::UtcNow.AddSeconds(3)
while (Test-Path -LiteralPath $directory) {
  try { Remove-Item -LiteralPath $directory -Recurse -ErrorAction Stop }
  catch {
    if ([DateTime]::UtcNow -ge $deadline) { throw }
    Start-Sleep -Milliseconds 200
  }
}
`);
  t.after(cleanup);
  const output = path.join(directory, "TrayTests.exe");
  const framework = process.arch === "x64" ? "Framework64" : "Framework";
  const compiler = path.join(process.env.SystemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  await execute(compiler, ["/nologo", "/target:exe", "/main:TrayTests", `/out:${output}`,
    "/reference:System.Windows.Forms.dll", "/reference:System.Drawing.dll", "/reference:System.Management.dll",
    "/reference:System.Web.Extensions.dll", "/reference:Microsoft.CSharp.dll",
    `/resource:${path.join(root, "public/icon-192.png")},CodexUsageMesh.AppIcon.png`,
    path.join(root, "scripts/windows/MeshTray.cs"), path.join(root, "test/fixtures/TrayTests.cs")], { windowsHide: true });
  const health = await execute(output, [directory], { windowsHide: true, timeout: 15_000 });
  assert.equal(Number(health.stdout.trim()), 23);
  const taskName = `CodexUsageMesh-TrayTest-${process.pid}`;
  const lifecycle = await ps(`
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$name = ${literal(taskName)}
$exe = ${literal(output)}
function Wait-Running {
  $deadline = [DateTime]::UtcNow.AddSeconds(10)
  do {
    if ((Get-ScheduledTask -TaskName $name).State -eq 'Running') { return }
    Start-Sleep -Milliseconds 100
  } while ([DateTime]::UtcNow -lt $deadline)
  throw 'Test task did not start'
}
function Control($action) {
  & $exe --control $name $action
  if ($LASTEXITCODE -ne 0) { throw "Control failed: $action" }
}
try {
  $action = New-ScheduledTaskAction -Execute $exe -Argument '--worker'
  $principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Limited
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
  Register-ScheduledTask -TaskName $name -TaskPath '\\' -Action $action -Principal $principal -Settings $settings | Out-Null
  Control 'resume'
  Wait-Running
  Control 'pause'
  if ((Get-ScheduledTask -TaskName $name).Settings.Enabled) { throw 'Pause did not disable recovery' }
  Control 'resume'
  Wait-Running
  Control 'restart'
  Wait-Running
  if (-not (Get-ScheduledTask -TaskName $name).Settings.Enabled) { throw 'Restart did not re-enable recovery' }
  'lifecycle-ok'
} finally {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $name
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
  Start-Sleep -Milliseconds 500
}
`);
  assert.match(lifecycle.stdout, /lifecycle-ok/);
  // Reproduce the cleanup race deterministically without a long-lived orphan:
  // the executable is still mapped when the test body's cleanup hooks begin.
  const delayed = spawn(output, ["--brief-worker"], { windowsHide: true, stdio: "ignore" });
  const delayedExit = once(delayed, "close");
  await once(delayed, "spawn");
  await cleanup();
  assert.equal((await delayedExit)[0], 0);
});
