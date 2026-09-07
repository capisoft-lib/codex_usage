# Changelog

## Unreleased

## 1.5.0 — 2026-09-07

- Added five-hour quota tracking, responsive quota navigation, a current WeeklyQuota filter, and separate 12-month and full-history ranges.
- Added an optional always-on-top desktop quota window, including remote dashboard connections through Mesh.
- Added persistent dashboard themes shared with administration and linked desktop quota windows.
- Added GPT-6 Astra and dated pricing history, with historical/current/custom pricing modes and calculation exports.
- Improved forecasts with incomplete pricing history and preserved observed quota curves independently of pricing availability. Unknown rates can still prevent a reliable projection.
- Kept current and completed quota curves continuous through their display endpoint and clarified historical hover values.
- Restored automatic dashboard refresh and collected available reset counts from Codex App Server while preserving unknown values.
- Improved Windows reporting-agent recovery, hidden background execution, removal cleanup, and self-hosted hub diagnostics.
- Localized command-line output and refreshed audited Sites dependencies.

Docker images: `capitaine/codex-usage-dashboard:1.5.0` and `:latest` (Linux AMD64 and ARM64). Pull the new image and recreate the container while preserving its existing configuration and storage volume. Update Windows reporting agents separately to receive collector and supervision changes.

## 1.4.0 — 2026-08-26

- Added an official Windows `CodexUsageMesh` Task Scheduler installer, single-instance PowerShell supervisor, sleep/resume recovery, non-zero-exit restart loop, UTF-8 timestamped logs, state-preserving updates, and task/process/sync/hub diagnostics.
- Extended the observed quota curve horizontally to the current time when no newer usage sample exists, while keeping forecast projection visually distinct.
- Added axis-aligned quota forecast hover details with keyboard navigation and localized date/value feedback.
- Added an installable Android PWA with manifest icons, offline shell caching, and a native install prompt shown only when supported by the browser.
- Added the public project support link to the repository and Docker documentation.
- Updated Alpine runtime packages during Docker builds so published images include currently available operating-system security fixes.

## 1.3.0 — 2026-08-20

- Replaced quota-history arrow glyphs with font-independent CSS chevrons and improved disabled-state visibility on mobile screens.
- Replaced per-machine private-Site bypass credentials with a rate-limited public Mesh ingress; machines now use only one-time enrollment and their own revocable Ed25519 identity.
- Kept Sites and Cloudflare deployment linkage in ignored local files and added neutral templates so every user provisions an isolated private Site, D1 database, and ingress.
- Updated the Sites development toolchain to resolve all npm audit findings and made CI audit complete dependency trees.

## 1.2.0 — 2026-08-15

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
