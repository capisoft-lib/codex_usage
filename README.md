# Codex Usage Dashboard

A small, privacy-conscious local dashboard for understanding Codex usage. It reads Codex session metadata from your machine and turns it into useful daily, weekly, monthly, and per-conversation metrics.

The dashboard focuses on a concise set of signals:

- input, cached input, output, reasoning, and total tokens;
- model calls and user turns;
- turn duration, median duration, and p95 duration;
- theoretical API cost by period and conversation;
- cache effectiveness and high-usage conversations;
- activity charts by hour, day, or month;
- filters by model, period, and conversation name.

The interface is available in English, French, and German. The selected language and custom pricing stay in the browser's local storage. The latest usage analysis is also cached locally for one minute, so reloading the dashboard does not reread session data unnecessarily; use **Refresh** to bypass the cache immediately.

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

The displayed cost is a theoretical simulation based on standard API token pricing. It is not a bill and does not represent the cost of a ChatGPT or Codex subscription.

Public model prices are preconfigured. Internal or unpublished Codex model identifiers use a clearly marked reference price until you configure an exact rate in the pricing dialog. Custom values are stored only in your browser's local storage.

Cost is calculated as:

```text
fresh input × input price
+ cached input × cached-input price
+ output × output price
```

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

## Project structure

```text
public/             Browser interface and translations
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
