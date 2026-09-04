# Install a reporting agent

The reporting agent lets a Windows, macOS, or Linux machine contribute its local Codex usage to a central dashboard. It analyzes session metadata locally, removes fields that are not allowed in the Mesh payload, signs the minimized snapshot with a machine-generated Ed25519 key, and sends it only to the configured hub.

This is not an autonomous Codex AI agent. It cannot run tasks, receive instructions from the hub, or read arbitrary files.

## Choose how the machine should run

| Mode | Command or image | Local interface | Reports to the hub |
| --- | --- | --- | --- |
| GUI plus agent | `npm start`, `npm run start:browser`, or the dashboard container | Yes, on port 4317 | Yes |
| Headless agent | `npm run start:agent` or Docker target `agent` | No | Yes |

Both modes use the same collector, privacy filter, signing identity, enrollment, and synchronization protocol.

## Prerequisites

Each machine needs:

- Codex session data under its local Codex directory;
- Node.js 20 or newer, or Docker;
- network access to the public Mesh ingress over HTTPS when the private Sites hub is used;
- a one-time association command created by the hub owner;
- a persistent writable location for the agent state file.

The agent never needs an OpenAI API key, a Sites bypass token, or `auth.json`. A shared infrastructure credential must never be installed on a reporting machine.

## 1. Create a one-time association command

For an OpenAI Sites hub:

1. sign in to the deployed Site;
2. open `/admin`;
3. select **Add a machine**;
4. copy the generated command.

The command contains only the non-secret public ingress address and a code that expires after ten minutes and can be used once. Create it only when the target machine is ready.

For a self-hosted hub, create the code through the administrator endpoint documented in the root [README](../README.md#self-hosted-central-hub).

## 2. Install from source with Node.js

Clone the repository on the machine:

```bash
git clone https://github.com/capisoft-lib/codex_usage.git
cd codex_usage
```

The root runtime has no third-party npm runtime dependencies. It reads the current user's Codex directory by default. Paste the command copied from `/admin`; it is the same on Windows PowerShell, macOS, and Linux:

```bash
npm run start:agent -- --hub-url "https://your-mesh-ingress.example" --associate "AAAA-BBBB-CCCC-DDDD-EEEE-FFFF-0000-1111"
```

For a private OpenAI Site, `MESH_HUB_URL` must be the dedicated public Mesh ingress URL, not the private Site URL. The ingress holds its upstream credential server-side and exposes no browser, dashboard, or administration route.

Use `npm start` for the browser dashboard with its background mini-window helper, or `npm run start:browser` without that helper, instead of `npm run start:agent` when the machine should also expose its local dashboard at [http://127.0.0.1:4317](http://127.0.0.1:4317).

## 3. Verify enrollment

A successful first run:

1. creates the persistent state file and its private signing key;
2. exchanges the one-time code for a hub node identity;
3. synchronizes a minimized snapshot;
4. prints a synchronization message;
5. shows the machine as active under the Site's `/admin` page.

After this succeeds, start the process later with only `npm run start:agent`. The agent has persisted the ingress address and its machine-specific identity; the one-time code is neither retained nor needed.

Protect `MESH_AGENT_STATE_PATH`. Deleting it creates a new signing identity and requires a fresh enrollment. Copying it to another machine would duplicate a trusted identity and must not be done.

## 4. Keep the agent running

On Windows, use the supported [`CodexUsageMesh` supervisor](windows-agent.md). It installs or updates the current user's scheduled task, preserves an existing association, recovers after sleep/resume, restarts non-zero Node exits, prevents overlapping task instances, and provides a health diagnostic.

On macOS or Linux, first run the association command interactively and verify enrollment. Then configure only `npm run start:agent` through the operating system's service manager:

- macOS: `launchd`;
- Linux: `systemd` or another supervised service.

Run it as the same user that owns the Codex session directory and give it write access only to its state/cache directory. After enrollment, the machine has no shared secret: protect the state file because it contains that machine's private signing key. Do not run it as an administrator or root unless the local environment makes that unavoidable.

## Docker operation

The existing Compose service runs the GUI and agent together whenever `MESH_HUB_URL` is present. Copy `.env.example` to the ignored `.env`, configure `CODEX_DATA_PATH` and the required `MESH_*` values, then run:

```bash
docker compose up -d --build
docker compose logs -f dashboard
```

After successful enrollment, remove `MESH_ENROLLMENT_CODE` from `.env` and recreate the service:

```bash
docker compose up -d
```

The named `codex-usage-dashboard-storage` volume preserves both the derived snapshot and the signing identity. Do not use `docker compose down -v` unless the machine is being deliberately unenrolled and its cached state may be deleted.

For a headless Docker image built from source:

```bash
docker build --target agent -t codex-usage-agent:local .
```

Run it with:

- the local `sessions/` and `archived_sessions/` directories mounted read-only;
- `session_index.jsonl` mounted read-only;
- a persistent volume mounted at `/app-cache`;
- `MESH_AGENT_STATE_PATH=/app-cache/mesh-agent.json`;
- the same `MESH_HUB_URL`, enrollment, and privacy settings used by the Node.js process;
- no published HTTP port.

## Privacy settings

Recommended defaults are:

```text
MESH_PROJECT_MODE=hash
MESH_INCLUDE_TITLES=false
```

Project modes:

- `hash` sends a stable machine-local pseudonym for each project;
- `basename` sends only the final project-directory name;
- `full` sends the full project identity and should be enabled only after an explicit privacy decision.

Enabling `MESH_INCLUDE_TITLES` permits sanitized conversation titles to leave the machine. Leave it disabled unless those titles are needed and their disclosure has been reviewed.

The Mesh payload excludes raw JSONL, prompts, responses, reasoning, tool output, credentials, usernames, and full local paths by default.

## Update an agent

For Windows Task Scheduler installations, follow [Update the repository and supervisor](windows-agent.md#update-the-repository-and-supervisor). The installed state is copy-if-absent and is never overwritten by an update.

For a source installation:

1. stop the supervised process;
2. preserve the agent state file;
3. update to the intended release or commit;
4. run `npm test`;
5. restart and confirm a successful synchronization.

For Docker, rebuild or pull the intended image, recreate the container while retaining the named state volume, and check its logs and `/admin` status.

Keep agents and the central hub on compatible Mesh protocol versions during schema or protocol upgrades.

For five-hour quota support, new agents remain compatible with older hubs: after a legacy payload-shape rejection, they retry the same batch without the optional short quota, using a fresh signed sequence. Sessions and weekly quotas still synchronize. Five-hour reporting resumes automatically after the hub is upgraded; authentication and other validation failures are never bypassed.

## Revoke, remove, or replace a machine

The Windows uninstall command removes only the local scheduled task and generated launcher. It deliberately retains local state and never revokes this or any other machine; see [Uninstall local supervision](windows-agent.md#uninstall-local-supervision).

To stop future access, revoke the machine from the hub's `/admin` page first. Then stop and remove the local process or container. The local state file can be retained for diagnosis, or deleted after revocation when permanent removal is intended.

If the state file is lost or corrupted:

1. revoke the previous machine identity in `/admin`;
2. move the unreadable state file out of the configured path;
3. create a new one-time enrollment code;
4. start the agent again and verify the replacement identity.

## Troubleshooting

### The agent says that `MESH_HUB_URL` is required

The headless command does not run in local-only mode. Set the exact hub base URL, without an API path.

### The enrollment code is rejected

Generate a new code from `/admin`, confirm that it has not expired or already been used, and verify the machine clock.

### The ingress is unavailable

Confirm that `MESH_HUB_URL` points to the public ingress and that its `/healthz` endpoint returns HTTP 200. Never work around an ingress failure by giving the private Site token to the machine.

### The machine enrolls again after every restart

`MESH_AGENT_STATE_PATH` is not persistent or writable. Preserve that exact file across restarts and container replacements.

### No new data appears

Confirm that the process is still running, the local Codex sources are readable, the hub is reachable, and `/admin` shows a recent machine update. Keep the source directories read-only; do not broaden access to the entire `.codex` directory.
