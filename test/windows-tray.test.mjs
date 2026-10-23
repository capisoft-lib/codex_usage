import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
  t.after(() => ps(`Remove-Item -LiteralPath ${literal(directory)} -Recurse -ErrorAction Stop`));
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
});
