# Supervise the reporting agent on Windows

The supported Windows setup runs `agent.mjs` behind a persistent PowerShell supervisor and a per-user Task Scheduler task named `CodexUsageMesh` by default. It runs without a visible console window. The supervisor survives an ordinary sleep, the task is also triggered by the Windows resume event, and a non-zero Node.js exit is restarted after 30 seconds. An independent one-minute trigger restarts supervision if the whole task stops, including after a console interruption.

The installer operates only on the local scheduled task and local files. It never calls the hub administration or revocation APIs, so installing, updating, or uninstalling one PC does not delete or change any other registered machine.

## Prerequisites

- Windows 10 or Windows 11;
- Node.js 20 or newer available to the current user;
- this repository checked out locally;
- the same Windows user that owns the local Codex session data;
- either an existing `.cache\mesh-agent.json` association or a fresh one-time association code.

Run the commands from the repository root in PowerShell. Administrator elevation is not intended: the task uses the current interactive user and `LeastPrivilege`.

## Install an already-associated machine

For a machine such as `WINDOWS-LAPTOP` where `.cache\mesh-agent.json` already contains the working association:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 -Action Install
```

The command:

1. stops only the local task named `CodexUsageMesh` if it already exists;
2. refuses to continue if another matching supervisor or Node agent is still running;
3. copies an earlier `%LOCALAPPDATA%\CodexUsageMesh\state\mesh-agent.json` state, or the legacy repository `.cache\mesh-agent.json`, once to `%LOCALAPPDATA%\CodexUsageMesh\mesh-agent.windows.json` when the installed state does not exist;
4. never overwrites an installed state during later runs;
5. generates `.cache\windows-agent\CodexUsageMesh.Supervisor.ps1` in the repository without an association code or infrastructure credential, avoiding Windows policies that block scheduled scripts from `AppData`;
6. registers and starts the current user's task.

The original state file is retained. After supervision is installed, do not start a second `npm run start:agent` process from the repository. The scheduled task is the owner of the reporting process.

## Install and associate a new machine

Create a one-time code under the central Site's `/admin` page, then immediately run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 `
  -Action Install `
  -HubUrl "https://your-mesh-ingress.example" `
  -AssociationCode "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111"
```

The installer performs one synchronous enrollment and synchronization before creating the supervised task. The one-time code appears only in that initial process invocation; it is not written to the task, launcher, state, or logs. Later starts load the hub URL and Ed25519 identity from the state file.

Use `-Alias "Nom lisible"` only on the first association. Otherwise the Windows hostname is used. Privacy remains `hash` with titles excluded by default; the explicit alternatives are `-ProjectMode basename|full` and `-IncludeTitles`.

## Task and recovery behavior

`CodexUsageMesh` has three triggers:

- opening a session for the installing Windows user;
- Windows `Microsoft-Windows-Power-Troubleshooter` event ID 1, emitted after resume from sleep;
- every minute, to restart a stopped task even when Windows does not retry its last exit code.

The task uses `MultipleInstancesPolicy=IgnoreNew`, unlimited execution time, `StartWhenAvailable`, and Task Scheduler restart-on-failure. The generated supervisor adds a named mutex as a second singleton boundary. Before each launch it also checks for an existing Node agent using the same script and state, since stopping a scheduled supervisor can leave its child alive. It waits for that child to exit instead of starting a second writer. A resume trigger cannot create a parallel supervisor when the logon instance is still alive.

The task starts PowerShell with `-WindowStyle Hidden`; no terminal needs to stay open. The supervisor launches the repository's current `agent.mjs`. When Node exits with a non-zero code, it logs the code and restart number, waits 30 seconds, and launches it again. A zero exit ends the supervisor; the next periodic trigger restores the task. A deliberate pause therefore requires disabling the task before stopping it:

```powershell
Disable-ScheduledTask -TaskName CodexUsageMesh -TaskPath '\'
Stop-ScheduledTask -TaskName CodexUsageMesh -TaskPath '\'
```

To resume, enable and start that same task. The periodic trigger respects disabled tasks and never overrides an explicit pause.

Logs are UTF-8 without BOM, with an ISO-8601 timestamp on every line:

```powershell
Get-Content '.\.cache\windows-agent\CodexUsageMesh.Supervisor.log' -Wait
```

Logs live beside the launcher in the repository cache; old logs under `%LOCALAPPDATA%\CodexUsageMesh\logs` are retained but no longer updated. The enrolled identity remains in `%LOCALAPPDATA%\CodexUsageMesh\mesh-agent.windows.json`.

## Diagnose

Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 -Action Diagnose
```

The diagnostic verifies and reports:

- task presence, current state, last result, logon/resume/recovery triggers, and hidden console configuration;
- exactly one supervisor and one matching Node agent process;
- enrolled state path and persisted hub URL;
- `lastSyncAt`, its age, and whether it is newer than five minutes;
- hub health reachability and HTTP status: `/healthz` for the public ingress, with a fallback to `/api/health` for self-hosted hubs when `/healthz` returns HTTP 404;
- supervisor log path.

It exits with code `0` only when all checks are healthy, otherwise with code `1`. Use `-MaxSyncAgeMinutes N` to change only the freshness threshold for a slow or intermittently connected machine.

`HubHealthUrl`, `HubStatusCode`, and `HubError` describe the final endpoint attempted. A successful fallback clears the initial 404 error. Authentication failures, server errors, and connection failures do not trigger fallback, and redirects are not followed. Each request has a ten-second timeout. The diagnostic does not modify the task or the enrolled state.

After a sleep/resume test, wait for the next collector interval and rerun the diagnostic. `LastSyncAt` must advance while the task remains `Running`. A non-zero exit can be confirmed in the log by an `agent exited; exitCode=...` line followed by `agent restart scheduled; restartAttempt=...` and a new launch.

## Update the repository and supervisor

Update the intended branch, then refresh the generated launcher and task:

```powershell
git switch develop
git pull --ff-only origin develop
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 -Action Update
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 -Action Diagnose
```

`Update` stops and replaces only the local task definition. The current installed state is never overwritten. If the flat state does not exist yet, an earlier supervised state under `%LOCALAPPDATA%\CodexUsageMesh\state\mesh-agent.json` takes priority over the repository legacy source and is copied once, so the node ID, private signing key, sequence, alias, `lastSyncAt`, and hub URL survive. No new association code is needed.

If the checkout moved, run `Update` from the new checkout. The task and launcher will point to the new repository path while continuing to use the same state under `%LOCALAPPDATA%`.

## Uninstall local supervision

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\windows\Install-CodexUsageMesh.ps1 -Action Uninstall
```

This stops and unregisters only `CodexUsageMesh` and removes only the generated supervisor file. It deliberately keeps the state under `%LOCALAPPDATA%\CodexUsageMesh` and the logs in the repository cache, and it does not revoke or delete any hub node. Reinstalling later therefore uses the same association.

For permanent removal, first revoke this exact machine from `/admin`. Only after checking the exact local target should its retained state be deleted. Revocation and state deletion are intentionally separate from the normal uninstall command.

## Troubleshooting

- **The task is `Ready` instead of `Running`:** inspect the final supervisor log lines. A missing repository, Node executable, or state makes the supervisor exit non-zero and Task Scheduler retries it.
- **The last result is `0xC000013A`:** the console was interrupted. Run `Update` to install the hidden action and one-minute recovery trigger; do not rely solely on restart-on-failure for this exit.
- **The task is running but `AgentProcessCount` is zero:** the supervisor may be inside its 30-second backoff. The log contains the exit code and next attempt.
- **The hub is unreachable:** verify the reported `HubHealthUrl`: `/healthz` for a public ingress, or `/api/health` for a self-hosted hub. Keep the configured hub URL as the base URL, without the health endpoint. Never configure the private Site URL or a Sites authorization token on a reporting machine.
- **The state is reported incomplete:** the installer leaves it untouched. Restore the correct existing file or revoke only that machine and perform a deliberate new association.
- **An instance is still active during update:** stop the manually launched Node/PowerShell process. The installer refuses to kill a process it cannot prove belongs to the task.
