<p align="center">
  <img src="https://raw.githubusercontent.com/capisoft-lib/codex_usage/main/public/icon.svg" width="96" height="96" alt="Local Usage Dashboard icon">
</p>

# Local Usage Dashboard for Codex

Local Usage turns the Codex session metadata stored on your computer into a fast, privacy-conscious usage dashboard. It can run entirely on one machine, or several machines can send signed, minimized usage snapshots to an optional central dashboard.

[**Stable release 1.6.0**](https://github.com/capisoft-lib/codex_usage/releases/tag/v1.6.0) · [Docker image 1.6.0](https://hub.docker.com/r/capitaine/codex-usage-dashboard/tags) · [Source code](https://github.com/capisoft-lib/codex_usage) · [AGPL-3.0-or-later](https://github.com/capisoft-lib/codex_usage/blob/main/LICENSE) · [Changelog](https://github.com/capisoft-lib/codex_usage/blob/main/CHANGELOG.md) · [CI status](https://github.com/capisoft-lib/codex_usage/actions/workflows/ci.yml)

## Donate

If you like this project and want to support its ongoing development, you can [buy me a coffee](https://buymeacoffee.com/capitaine). Donations are entirely optional; the dashboard remains free and open source.

## What it shows

- API-equivalent cost split between fresh input, cached input, and output;
- estimated ChatGPT Codex credits, including observed Fast-mode multipliers;
- projects, conversations, model calls, turns, duration, tokens, and cache rate;
- hourly, daily, monthly, and full-history activity charts;
- current and historical weekly quota periods with cumulative consumption and end-of-window forecasts;
- project, model, period, usage, and conversation filters;
- nine interface languages.

## New in 1.6.0

- Astra and Sol 6.1 Ultrafast are recognized, displayed and priced with dated eligibility.
- Fast credit billing (2x) and quota weighting (2.5x), plus Ultrafast credit billing (6x) and quota weighting (8x), are calculated separately.
- Recent releases added relational SQLite storage, faster history queries, and clearer loading and error states.

## Docker

The public image supports Linux AMD64 and ARM64 and runs as a non-root user:

```text
capitaine/codex-usage-dashboard:1.6.0
```

```bash
docker pull capitaine/codex-usage-dashboard:1.6.0
docker compose up -d
```

Inspect the published multi-platform manifest and digest:

```text
docker buildx imagetools inspect capitaine/codex-usage-dashboard:1.6.0
```

The published manifests include SBOM and provenance attestations. See the [full README](https://github.com/capisoft-lib/codex_usage#readme) for scoped read-only mounts, PowerShell/macOS/Linux commands, Compose configuration, and hardened deployment examples.

## Deployment modes

- **Local GUI:** reads only this machine's Codex session metadata and serves the dashboard locally.
- **Local GUI plus reporting:** keeps the local interface while sending signed minimized snapshots to a configured hub.
- **Headless reporting agent:** sends minimized snapshots without opening an HTTP port.
- **Central hub:** aggregates independently signed machine snapshots through OpenAI Sites or a self-hosted server.

Local mode is the default. Nothing is sent to a hub unless `MESH_HUB_URL` is explicitly configured.

## Privacy and security

- The local server listens on `127.0.0.1` by default.
- Session files are opened read-only.
- The dashboard never needs an OpenAI API credential and never reads `auth.json`.
- Docker mounts only the session directories and title index, not the entire `.codex` directory.
- Browser responses use an explicit allowlist and exclude message text, file contents, local paths, parse details, and modification times.
- Mesh reporting removes disallowed fields before signing and transmission.
- Reporting machines never receive the private Site credential.
- There is no analytics, telemetry, external font, or CDN asset.

Each OpenAI Sites deployment is private to its authenticated owner. Every machine has its own revocable Ed25519 identity and enrolls with a short-lived one-time code.

## Documentation

- [Complete project README](https://github.com/capisoft-lib/codex_usage#readme)
- [Install a reporting agent](https://github.com/capisoft-lib/codex_usage/blob/main/docs/reporting-agent.md)
- [Install the Windows supervised agent](https://github.com/capisoft-lib/codex_usage/blob/main/docs/windows-agent.md)
- [Deploy the central dashboard with OpenAI Sites](https://github.com/capisoft-lib/codex_usage/blob/main/docs/sites-deployment.md)
- [Deploy the public Mesh ingress](https://github.com/capisoft-lib/codex_usage/blob/main/docs/mesh-ingress.md)

Local Usage is independent free software and is not affiliated with, endorsed by, or sponsored by OpenAI. “Codex” and “OpenAI” describe compatibility; their trademarks remain the property of their owners. The complete project is licensed under GNU AGPL version 3 or any later version.
