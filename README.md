<p align="center">
  <img src="public/icon.svg" width="96" height="96" alt="Local Usage Dashboard icon">
</p>

# Local Usage Dashboard for Codex

A small, privacy-conscious local dashboard for understanding Codex usage. It reads Codex session metadata from your machine and turns it into useful daily, weekly, monthly, and per-conversation metrics.

[**Release 1.0.2**](https://github.com/capisoft-lib/codex_usage/releases/tag/v1.0.2) · [AGPL-3.0-or-later](LICENSE) · [Docker Hub](https://hub.docker.com/r/capitaine/codex-usage-dashboard) · [GitHub Container Registry](https://github.com/capisoft-lib/codex_usage/pkgs/container/codex-usage-dashboard) · [Changelog](CHANGELOG.md) · [CI status](https://github.com/capisoft-lib/codex_usage/actions/workflows/ci.yml)

The dashboard is organized around the questions that matter first:

- API-equivalent cost, visible immediately and split between fresh input, cached input, and output;
- active projects, cost share by project, and one-click project filtering;
- cost activity by hour, day, or month;
- exact token totals, cache rate, model calls, turns, and duration;
- API-equivalent cost by conversation;
- estimated ChatGPT Codex credits, including per-call Fast mode multipliers;
- filters by project, model, period, usage, and conversation name.

The interface is available in French, English, German, Spanish, Italian, Portuguese, Japanese, Russian, and Simplified Chinese. On the first visit, the dashboard follows the browser language when it is supported; an explicit selection and custom pricing stay in the browser's local storage. The server refreshes usage in the background and persists its complete per-session analysis, so the dashboard can render immediately instead of processing all sessions during a page request. Unchanged files reuse their stored analysis; only new or modified sessions are parsed again. An open page checks for a newer snapshot every 15 seconds; use **Refresh** to force a check immediately.

## Independence and branding

Local Usage is an independent free-software project and is not affiliated with, endorsed by, or sponsored by OpenAI. Its chart icon is original project artwork and is licensed with the rest of the repository under AGPL-3.0-or-later. “Codex” and “OpenAI” are referenced only to describe compatibility; their names and trademarks remain the property of their respective owner and are not part of this project's branding.

## Requirements

- [Docker](https://www.docker.com/) for the published-image option, or [Node.js](https://nodejs.org/) 20 or newer for the direct local option
- A local Codex installation with session files under the Codex home directory

No npm dependencies are required.

## Direct local launch

Clone the repository:

```bash
git clone https://github.com/capisoft-lib/codex_usage.git
cd codex_usage
```

On Windows, double-click `start-dashboard.cmd`, or run it from PowerShell:

```powershell
.\start-dashboard.cmd
```

On macOS or Linux:

```bash
chmod +x start-dashboard.sh
./start-dashboard.sh
```

You can also start the server directly with Node:

```bash
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317) in your browser.

Direct mode automatically reads only these paths under the current user's Codex directory:

```text
~/.codex/sessions/
~/.codex/archived_sessions/
~/.codex/session_index.jsonl
```

It does not authenticate with OpenAI and does not open `auth.json`.

## Docker

The image is based on Node Alpine, runs as a non-root user with all Linux capabilities removed, and receives only the three required Codex log sources through separate read-only mounts. The `.codex` root and `auth.json` are never mounted. A small named volume keeps the generated snapshot between container restarts.

### Published image (recommended)

The public image is available from [Docker Hub](https://hub.docker.com/r/capitaine/codex-usage-dashboard) for Linux AMD64 and ARM64:

```text
capitaine/codex-usage-dashboard:1.1.0
```

Use the versioned tag for reproducible installs. The `latest` tag follows the newest published image. No Docker Hub login, repository clone, or local image build is required. The previous 1.0.2 release is also mirrored at `ghcr.io/capisoft-lib/codex-usage-dashboard:1.0.2`.

On Windows PowerShell:

```powershell
$codexData = Join-Path $env:USERPROFILE ".codex"
$image = "capitaine/codex-usage-dashboard:1.1.0"

docker pull $image
docker volume create codex-usage-dashboard-storage
docker run -d `
  --name codex-usage-dashboard `
  --restart unless-stopped `
  --init `
  --read-only `
  --security-opt no-new-privileges:true `
  --cap-drop ALL `
  --pids-limit 128 `
  -p 127.0.0.1:4317:4317 `
  --mount "type=bind,source=$codexData\sessions,target=/codex-data/sessions,readonly" `
  --mount "type=bind,source=$codexData\archived_sessions,target=/codex-data/archived_sessions,readonly" `
  --mount "type=bind,source=$codexData\session_index.jsonl,target=/codex-data/session_index.jsonl,readonly" `
  --mount "type=volume,source=codex-usage-dashboard-storage,target=/app-cache" `
  --tmpfs /tmp `
  $image
```

On macOS or Linux:

```bash
IMAGE="capitaine/codex-usage-dashboard:1.1.0"

docker pull "$IMAGE"
docker volume create codex-usage-dashboard-storage
docker run -d \
  --name codex-usage-dashboard \
  --restart unless-stopped \
  --init \
  --read-only \
  --security-opt no-new-privileges:true \
  --cap-drop ALL \
  --pids-limit 128 \
  -p 127.0.0.1:4317:4317 \
  --mount "type=bind,source=$HOME/.codex/sessions,target=/codex-data/sessions,readonly" \
  --mount "type=bind,source=$HOME/.codex/archived_sessions,target=/codex-data/archived_sessions,readonly" \
  --mount "type=bind,source=$HOME/.codex/session_index.jsonl,target=/codex-data/session_index.jsonl,readonly" \
  --mount "type=volume,source=codex-usage-dashboard-storage,target=/app-cache" \
  --tmpfs /tmp \
  "$IMAGE"
```

Then open [http://127.0.0.1:4317](http://127.0.0.1:4317). To inspect or stop this container:

```bash
docker logs -f codex-usage-dashboard
docker stop codex-usage-dashboard
```

### Build from source with Compose

Copy `.env.example` to `.env`, then set `CODEX_DATA_PATH` to the absolute path of your local `.codex` directory. On Windows, for example:

```powershell
Copy-Item .env.example .env
# Edit .env and set CODEX_DATA_PATH=C:/Users/your-name/.codex
docker compose up -d --build
```

On macOS or Linux:

```bash
cp .env.example .env
# Edit .env and set CODEX_DATA_PATH=/home/your-name/.codex
docker compose up -d --build
```

Then open [http://127.0.0.1:4317](http://127.0.0.1:4317). Useful commands:

```bash
docker compose logs -f dashboard
docker compose down
```

`docker compose down` keeps the named storage volume. Avoid `docker compose down -v` unless you intentionally want to delete the persisted analysis.

The following sources must exist before starting Compose:

```text
$CODEX_DATA_PATH/sessions/
$CODEX_DATA_PATH/archived_sessions/
$CODEX_DATA_PATH/session_index.jsonl
```

Recent Codex installations create them automatically. If an optional archive or index is absent, create an empty directory or file respectively before starting Docker. Compose deliberately refuses to create a missing host path, which catches incorrect configuration instead of silently indexing an empty directory.

The first start still needs one complete indexing pass. Later page loads and container restarts use the persisted per-session storage while a lightweight incremental pass runs in the background. Writes replace the stored snapshot atomically. This storage contains derived metadata and token counters only; message and reasoning contents are never copied into it.

### Windows

PowerShell example:

```powershell
git clone https://github.com/capisoft-lib/codex_usage.git
Set-Location codex_usage
npm start
```

By default, Codex data is read from `%USERPROFILE%\.codex`.

### macOS and Linux

```bash
git clone https://github.com/capisoft-lib/codex_usage.git
cd codex_usage
npm start
```

By default, Codex data is read from `$HOME/.codex`.

## Codex Usage Mesh (multi-PC, optionnel)

Mesh agrège plusieurs installations sans partager les identifiants Codex. Chaque PC analyse ses propres journaux localement, retire les champs sensibles, signe un lot avec une clé Ed25519 créée sur la machine, puis l’envoie vers un hub. Le fonctionnement local reste le comportement par défaut.

Ce qui est transmis : compteurs d’usage et de tokens, modèles, horaires, durée, état, alias choisi pour la machine et identifiant de projet haché par défaut. Ce qui ne l’est jamais : `auth.json`, JSONL bruts, prompts, réponses, raisonnement, sorties d’outils, commandes, secrets, nom d’utilisateur ou chemin complet par défaut. Le quota Codex est une observation liée au compte : le hub conserve la plus récente et ne l’additionne jamais.

### Hub auto-hébergé

Créez un jeton administrateur long et aléatoire dans un fichier `.env` non versionné, puis démarrez le hub :

```powershell
$env:MESH_ADMIN_TOKEN = '<secret-long-et-aléatoire>'
docker compose -f compose.mesh-hub.yaml up -d --build
```

Créez un code valable dix minutes :

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:4318/api/mesh/enrollments `
  -Headers @{ Authorization = "Bearer $env:MESH_ADMIN_TOKEN" }
```

Sur chaque PC, ajoutez à l’environnement du dashboard local :

```text
MESH_HUB_URL=http://adresse-privee-du-hub:4318
MESH_NODE_ALIAS=PC Bureau
MESH_ENROLLMENT_CODE=AAAA-BBBB-CCCC-DDDD
MESH_AGENT_STATE_PATH=/app-cache/mesh-agent.json
```

Le code peut être retiré après le premier succès. Conservez le fichier d’état : il contient la clé privée de la machine et doit rester lisible uniquement par son compte de service. Pour exposer le hub hors d’un réseau privé, placez-le derrière HTTPS et une couche d’authentification pour l’interface ; les routes d’ingestion restent protégées par signatures, séquences monotones, horodatage et révocation.

### Hub OpenAI Sites

Le projet prêt à héberger se trouve dans `sites-hub/`. Il utilise Sites pour l’authentification ChatGPT du navigateur et D1 pour les codes, machines et snapshots. Les routes d’enrôlement et d’ingestion acceptent uniquement le protocole signé ; elles ne réutilisent jamais la session Codex ou `auth.json` d’un PC.

```powershell
cd sites-hub
npm install
npm run db:generate
npm test
```

Le déploiement reste volontairement séparé de la préparation du code : vérifiez la migration D1 générée puis publiez avec le flux Sites lorsque vous souhaitez réellement créer l’agrégateur distant.

### Confidentialité et révocation

- `MESH_PROJECT_MODE=hash` (défaut) envoie un pseudonyme salé localement ; `basename` et `full` sont des choix explicites plus révélateurs.
- `MESH_INCLUDE_TITLES=false` (défaut) supprime les titres de conversations.
- Le hub est « push-only » : il ne peut ni lire les fichiers du PC, ni lancer une commande, ni réclamer un champ supplémentaire.
- Révoquer une machine bloque immédiatement ses futurs lots. Changez le jeton administrateur s’il a pu être exposé.
- Deux PC qui possèdent une copie du même journal restent deux observations distinctes en version 1 ; l’alias rend cette provenance explicite. Les numéros de séquence empêchent en revanche le rejeu et le double traitement d’un même lot par machine.

## Configuration

The server supports these optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Network interface used by the local HTTP server. |
| `PORT` | `4317` | HTTP port used by the dashboard. |
| `CODEX_HOME` | `$HOME/.codex` | Location of the Codex data directory. |
| `CODEX_SESSIONS_PATH` | `$CODEX_HOME/sessions` | Advanced: explicit session directory, used by the scoped Docker mode. |
| `CODEX_ARCHIVED_SESSIONS_PATH` | `$CODEX_HOME/archived_sessions` | Advanced: explicit archived-session directory. |
| `CODEX_SESSION_INDEX_PATH` | `$CODEX_HOME/session_index.jsonl` | Advanced: explicit conversation-title index. |
| `REFRESH_INTERVAL_MS` | `60000` | Delay between source reindexing checks, in milliseconds (minimum 1000). The browser still polls the lightweight health endpoint every 15 seconds. |
| `SNAPSHOT_PATH` | `.cache/usage-snapshot.json` | Persisted precomputed snapshot; set to an empty string to disable it. |
| `DASHBOARD_MODE` | `local` | `local` analyse ce PC ; `hub` accepte et agrège les snapshots Mesh. |
| `MESH_HUB_URL` | empty | Active l’agent sortant vers un hub HTTPS. |
| `MESH_NODE_ALIAS` | empty | Alias explicite de ce PC, requis quand l’agent est activé. |
| `MESH_ENROLLMENT_CODE` | empty | Code à usage unique requis seulement au premier enrôlement. |
| `MESH_AGENT_STATE_PATH` | `.cache/mesh-agent.json` | État et clé privée de l’agent ; à conserver et protéger. |
| `MESH_PROJECT_MODE` | `hash` | Confidentialité projet : `hash`, `basename` ou `full`. |
| `MESH_INCLUDE_TITLES` | `false` | Active explicitement l’envoi des titres nettoyés. |

Windows PowerShell example:

```powershell
$env:PORT = "8080"
$env:CODEX_HOME = "D:\CodexData"
npm start
```

macOS/Linux example:

```bash
PORT=8080 CODEX_HOME=/path/to/.codex npm start
```

## Pricing estimates

The dashboard displays two deliberately separate measurements:

- **Codex credits** use the official ChatGPT Codex token rate card. Each model call inherits the `service_tier` recorded in the session; `priority` and `fast` calls receive the documented Fast multiplier (currently 2.5x for GPT-5.6/GPT-5.5 and 2x for GPT-5.4).
- **API-equivalent cost** simulates standard API pricing in US dollars. Fast multipliers do not apply to API-key usage.

Calls for models absent from the official Codex credit rate card are reported as unrated instead of silently using a reference model. Credit rates and Fast multipliers are implemented in `public/usage-pricing.js` and covered by automated tests.

The displayed cost is an estimate based on standard API token pricing. It is not a bill and does not represent the cost of a ChatGPT or Codex subscription.

Public model prices are preconfigured. Internal or unpublished Codex model identifiers use a clearly marked reference price until you configure an exact rate in the pricing dialog. Custom values are stored only in your browser's local storage.

Cost is calculated as:

```text
fresh input × input price
+ cached input × cached-input price
+ output × output price
```

For GPT-5.6 calls above 272k input tokens, the documented 2x input and 1.5x output multipliers are applied to the full request. The session logs do not expose enough information to identify cache writes or every separately billed tool call, so those fees are explicitly excluded from the estimate. Current GPT-5.6 rates and the long-context rule are sourced from the [official OpenAI model documentation](https://developers.openai.com/api/docs/models/gpt-5.6-sol).

Reasoning tokens are shown separately when available, but are already included in output usage and are not charged twice.

## Privacy and security

- The server listens on `127.0.0.1` by default and is not exposed to the local network.
- Session files are opened read-only.
- The dashboard never needs an OpenAI, ChatGPT, or API credential and never reads `auth.json`.
- Docker does not mount the `.codex` root; only the two session directories and title index are visible in the container.
- Message text, reasoning text, tool output, credentials, and file contents are never returned by the dashboard API.
- Analyzer-internal file paths, modification times, and parse-error details are removed from browser responses through an explicit allowlist.
- The dashboard reads only session metadata, timestamps, model identifiers, working-directory metadata, and token counters.
- No analytics, telemetry, external fonts, CDN assets, or third-party services are used.
- No Codex data is uploaded anywhere.

Avoid changing `HOST` to `0.0.0.0` unless you understand that this exposes the dashboard and its metadata to other devices that can reach your machine.

## Data sources and limitations

The dashboard reads:

```text
$CODEX_HOME/sessions/
$CODEX_HOME/archived_sessions/
$CODEX_HOME/session_index.jsonl
```

Codex session logs are an internal format and may change. The parser ignores malformed or partially written JSONL lines so an active session does not break the dashboard.

A user turn can trigger several model calls, especially when Codex uses tools. For that reason, the dashboard reports turns and model calls separately. Input usage may also include instructions, repository context, prior messages, and tool results—not only text typed by the user.

## Development

Run syntax checks:

```bash
npm run build
```

Run tests:

```bash
npm test
```

Run the complete validation suite:

```bash
npm run check
```

The project intentionally uses only Node.js built-in modules and browser-native HTML, CSS, and JavaScript.

Contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before submitting changes, especially its privacy requirements for fixtures, logs, and local Codex data.

## Free-software license

The GitHub repository and the published Docker images are public and designed to be shared without local Codex sessions, credentials, caches, or machine-specific paths. The image metadata does identify its public Docker Hub namespace and source GitHub repository so users can trace where the software comes from.

The complete project—including its original icon and documentation—is free software licensed under [GNU AGPL version 3 or any later version](LICENSE). You may use, study, modify, redistribute, and sell the software. Modified versions that are distributed must remain under the same license, and a modified version used through a computer network must offer its corresponding source code to its users.

Copyright © 2026 capisoft-lib and contributors.

The license does not grant rights to third-party names or trademarks. This repository contains no OpenAI logo artwork; references to Codex and OpenAI describe compatibility only.

## Project structure

```text
public/             Browser interface, icon, locale catalogues, and pricing logic
LICENSE             GNU Affero General Public License version 3
src/analyzer.mjs    Read-only Codex session parser
src/public-usage.mjs Browser API privacy boundary and allowlist
test/               Parser and privacy regression tests
server.mjs          Local HTTP server
start-dashboard.*   Direct local launchers for Windows and macOS/Linux
```

## Troubleshooting

### The dashboard shows no sessions

Confirm that `CODEX_HOME` points to the directory containing `sessions` or `archived_sessions`, then restart the server.

For Docker, also confirm that `sessions/`, `archived_sessions/`, and `session_index.jsonl` exist below `CODEX_DATA_PATH`. The health endpoint reports the source as unavailable when neither session directory is readable.

### A model uses the reference price

Open the pricing dialog with the `$` button and enter the model's input, cached-input, and output prices per million tokens.

### Port 4317 is already in use

Select another port:

```bash
PORT=8080 npm start
```

On PowerShell:

```powershell
$env:PORT = "8080"
npm start
```
