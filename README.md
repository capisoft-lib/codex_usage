# Codex Usage Dashboard

A small, privacy-conscious local dashboard for understanding Codex usage. It reads Codex session metadata from your machine and turns it into useful daily, weekly, monthly, and per-conversation metrics.

The dashboard is organized around the questions that matter first:

- API-equivalent cost, visible immediately and split between fresh input, cached input, and output;
- active projects, cost share by project, and one-click project filtering;
- cost activity by hour, day, or month;
- exact token totals, cache rate, model calls, turns, and duration;
- API-equivalent cost by conversation;
- estimated ChatGPT Codex credits, including per-call Fast mode multipliers;
- filters by project, model, period, usage, and conversation name.

The interface is available in English, French, and German. The selected language and custom pricing stay in the browser's local storage. The server refreshes usage in the background and persists its complete per-session analysis, so the dashboard can render immediately instead of processing all sessions during a page request. Unchanged files reuse their stored analysis; only new or modified sessions are parsed again. An open page checks for a newer snapshot every 15 seconds; use **Refresh** to force a check immediately.

## Requirements

- [Node.js](https://nodejs.org/) 20 or newer
- A local Codex installation with session files under the Codex home directory

No npm dependencies are required.

## Installation

Clone the repository:

```bash
git clone https://github.com/capisoft-lib/codex_usage.git
cd codex_usage
```

Start the server:

```bash
npm start
```

Open [http://127.0.0.1:4317](http://127.0.0.1:4317) in your browser.

## Docker

The image is based on Node Alpine, runs as a non-root user, and reads the Codex directory through a read-only mount. A small named volume keeps the generated snapshot between container restarts.

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

## Configuration

The server supports these optional environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Network interface used by the local HTTP server. |
| `PORT` | `4317` | HTTP port used by the dashboard. |
| `CODEX_HOME` | `$HOME/.codex` | Location of the Codex data directory. |
| `REFRESH_INTERVAL_MS` | `15000` | Delay between background checks, in milliseconds (minimum 1000). |
| `SNAPSHOT_PATH` | `.cache/usage-snapshot.json` | Persisted precomputed snapshot; set to an empty string to disable it. |

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
- Message text, reasoning text, tool output, credentials, and file contents are never returned by the dashboard API.
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

## Project structure

```text
public/             Browser interface, pricing logic, and translations
src/analyzer.mjs    Read-only Codex session parser
test/               Parser and privacy regression tests
server.mjs          Local HTTP server
```

## Troubleshooting

### The dashboard shows no sessions

Confirm that `CODEX_HOME` points to the directory containing `sessions` or `archived_sessions`, then restart the server.

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
