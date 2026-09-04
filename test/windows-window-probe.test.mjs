import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("Windows probe follows pseudoconsole owners and ignores zero-size or unrelated windows", { skip: process.platform !== "win32" }, async (t) => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-window-probe-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const assembly = path.join(directory, "WindowProbe.dll");
  const framework = process.arch === "x64" ? "Framework64" : "Framework";
  const csc = path.join(process.env.SystemRoot, "Microsoft.NET", framework, "v4.0.30319", "csc.exe");
  const built = spawnSync(csc, ["/nologo", "/target:library", `/out:${assembly}`, path.join(root, "scripts", "windows", "WindowProbe.cs")], { encoding: "utf8", windowsHide: true });
  assert.equal(built.status, 0, built.stderr || built.stdout);
  const script = `
Add-Type -Path '${assembly.replaceAll("'", "''")}'
function W($h,$o,$p,$v,$c,$w,$height) { $x=New-Object CodexUsageMesh.WindowRecord; $x.Handle=$h; $x.Owner=$o; $x.ProcessId=$p; $x.Visible=$v; $x.ClassName=$c; $x.Width=$w; $x.Height=$height; $x }
$windows=@((W 1 2 10 $true 'PseudoConsoleWindow' 0 0),(W 2 0 20 $true 'CASCADIA_HOSTING_WINDOW_CLASS' 800 600),(W 3 0 30 $true 'Unrelated' 800 600),(W 4 0 10 $true 'Zero' 0 10),(W 5 0 10 $false 'Hidden' 100 100))
[CodexUsageMesh.WindowProbe]::VisibleWindows([uint32[]]@(10),$windows) | Select-Object Handle,ClassName | ConvertTo-Json -Compress
`;
  const powershell = path.join(process.env.SystemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  const result = spawnSync(powershell, ["-NoProfile", "-NonInteractive", "-Command", script], { encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { Handle: 2, ClassName: "CASCADIA_HOSTING_WINDOW_CLASS" });
});
