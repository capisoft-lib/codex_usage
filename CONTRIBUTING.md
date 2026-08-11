# Contributing

Contributions that make the dashboard clearer, more accurate, or safer are welcome.

## Development workflow

1. Create a focused branch from `main`.
2. Keep the project dependency-free unless a dependency has a clear maintenance benefit.
3. Run `npm run check` before opening a pull request.
4. If Docker-related files change, also run `docker build .`.

## Privacy requirements

Privacy regressions are release blockers. A contribution must never commit or expose:

- `.env` files, API keys, tokens, passwords, or private keys;
- Codex session JSONL files, cached usage snapshots, or local databases;
- message text, reasoning text, tool output, credentials, or file contents;
- personal absolute paths in examples, fixtures, screenshots, or logs.

Keep the default server binding on `127.0.0.1`. The browser API should receive only the derived metadata and token counters required by the interface.

Use synthetic data in tests and documentation. Before committing, inspect the staged file list and scan it for credentials and personal paths.

## Pull requests

Explain what changed, why it changed, and how it was validated. Keep unrelated changes in separate pull requests and call out any pricing assumption or session-format dependency explicitly.
