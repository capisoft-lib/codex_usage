# Changelog

## Unreleased

- Added a seven-day quota forecast with daily boundaries, EMA-weighted consumption, and localized Weekly Quota navigation.
- Added navigable historical weekly quota periods with observed subscription tiers, early-reset boundaries, hourly activity bars, cumulative consumption curves, calibrated credit-capacity estimates, and a centered sticky period navigator.
- Made `public/` the single editable dashboard UI source and generate one manifested bundle for the local server, Docker, and Codex Sites.
- Unified local and hosted reads behind versioned `/api/capabilities` and `/api/usage` contracts.
- Extracted the reusable local collector and added `npm run start:agent` plus a headless Docker target.
- Removed generated Sites dashboard assets from version control; every Sites build now regenerates them from the shared bundle.
- Escaped dynamic KPI metadata and enforced byte-level request limits on Sites Mesh endpoints.
- Updated the Sites build toolchain, added Sites validation to CI, and removed unused package managers from the runtime container image.

## 1.1.0 — 2026-08-14

- Increased all visible interface font sizes by 2 px, with responsive spacing adjusted to preserve the mobile layout.
- Added a sortable last-model-call column to the conversation table.
- Added a persistent custom start/end date-time range, including an unbounded “Now” end mode.
- Added the latest locally observed weekly Codex quota, reset date, and explicit reset-count availability.

## 1.0.2 — 2026-08-12

- Released the complete project as AGPL-3.0-or-later free software.
- Replaced the third-party OpenAI artwork with an original project icon covered by the project license.
- Repositioned Codex as a compatibility reference under the independent Local Usage identity.
- Added persistent source-code and license links to the web interface.
- Added license metadata and the license text to published container images.

## 1.0.1 — 2026-08-12

- Added API-equivalent cost, Codex credit, token, model-call, project, and conversation views.
- Added daily, weekly, monthly, and full-history activity periods with proportional stacked charts.
- Fixed chart baselines so labeled and hidden-label columns stay aligned.
- Added proportional cost and project progress bars.
- Added nine interface languages and persistent local pricing preferences.
- Added incremental on-disk indexing for fast reloads of large Codex histories.
- Restricted data access to sessions, archived sessions, and the session title index.
- Added hardened Docker deployment for Linux AMD64 and ARM64 through Docker Hub and GHCR.
- Added direct Windows, macOS, and Linux launchers, privacy documentation, and 29 automated checks.
