# Page loading measurements — 2026-10-19

Work branch: `codex/page-loading-performance`. The initial dirty working tree was preserved. Existing local changes were included in the baseline; this work is not a production deployment.

## Hosted baseline

Sites Worker logs captured before the changes contained 45 completed quota-detail requests returning HTTP 409 between 04:15 and 05:19 UTC on October 19. Median server wall time: **8,431 ms**, range **7,670–13,175 ms**. One additional incomplete quota request was excluded. This is server time, not browser rendering time.

The quota endpoint discarded completed reads when ingestion advanced its revision. Frequent synchronization could therefore keep the graph unavailable. The revised endpoint returns the completed forecast without an ETag, with `private, no-store` and no exact revision marker. Regression tests cover this case and stale ETag removal.

## Same-data local comparison

Node 24.19.0, SQLite, three sequential samples per case. A consistent backup of a local database was frozen before comparing both implementations: **10,122 sessions and 226,520 calls**. It was read-only during both runs. The before implementation is the source preserved before optimization, including prior local edits. SQL time, database round trips and adapter bytes are recorded by the benchmark. Metadata/authentication, network latency and browser rendering are outside this measurement. These cases disable durable rollups to isolate the read-path changes.

| Scenario | Before, median | After, median | Observation |
| --- | ---: | ---: | --- |
| Overview, all history | 2,341 ms | 2,295 ms | About 2%; small enough to treat cautiously |
| Projects, all history | 2,101 ms | 2,102 ms | Essentially unchanged |
| Conversations, all history | 2,296 ms | 2,083 ms | About 9% faster |
| Overview, current week | 74 ms | 69 ms | About 7% faster without rollups |
| Quota detail with calibration history | **10,098 ms** | **1,326 ms** | **7.6× faster** |

Quota database round trips decreased from **78 to 30**, and adapter output decreased from **79.6 MB to 50.4 MB**. Full serialized page/forecast hashes matched before and after for all five scenarios. No counts, ordering or monetary outputs changed in this fixture.

## Last-seven-days cache

A separate deterministic fixture contains 4,096 sessions and 262,144 calls, spread over 70 days, including the current month. Five samples compare the same seven-calendar-day overview before and after warming the available cache:

| Scenario | Before | After |
| --- | ---: | ---: |
| Recent-week overview, median | **136.70 ms** | **55.03 ms** |
| Initial preparation, outside the timed warm reads | 0.70 ms | 48.23 ms |

The warm overview is **2.5× faster** in this synthetic measurement. Serialized results matched exactly. This is a local cache benchmark, not an observed Sites production gain.

Only completed UTC days are reused. Today and partial/split days stay live. Late inserts, corrections and deletion invalidate affected days through the existing triggers. Preparation targets the requested range, prioritizes recent days and writes up to 128 session-days in four atomic statements. Custom prices and project grouping remain request-specific. Raw calls for quota forecasts remain exact; daily aggregates do not replace their timestamps.

## Reproduce

Use Node 22.15+ (measurements above used Node 24.19):

```powershell
node scripts/benchmark-pages.mjs
# Warm recent-week cache on an isolated synthetic in-memory database:
$env:BENCH_ROLLUPS = '1'
$env:BENCH_SCENARIOS = 'overview-week'
node scripts/benchmark-pages.mjs
```

`BENCH_SOURCE_ROOT` selects an alternative preserved source tree. `BENCH_DATABASE` selects an existing SQLite file, always opened read-only; omit it for the generated fixture. `BENCH_PASSES` changes the sample count. Frozen data and raw measurement JSON are retained under ignored `.cache/page-performance/`; no user history is committed.

Functional validation covers owner/revocation isolation, events spanning quota batch boundaries, invalid dates, exact forecast output, cache invalidation, current-day freshness, graph/range boundaries, concurrent ingestion, request timeout and cancellation. The root build/check passed 355 tests; the Sites build and 15 tests passed, including real workerd/D1 execution; TypeScript passed. Production after measurements and browser-rendering measurements require deployment; no production change was made in this work branch.

## Weekly forecast follow-up

The owner reported the projection chart still loading slowly after Site version 52. An authenticated in-browser request to its quota-detail endpoint took **9,735 ms**, returning 2,720 selected-week calls and about 1.11 MB. Worker logs showed 9–12-second successful reads: the older calibration still retrieved several months of individual events.

The revised path retains individual events for the selected week. Older EMA history is grouped by its exact hour relative to the forecast anchor, UTC pricing day, model, tier and validity. Calibration is grouped separately across all comparable quota windows, keeping inclusive observation boundaries. The forecast's 28-day lookback, historical calibration, invalid gaps and pricing rules remain unchanged. No price totals are persisted. `Server-Timing` separates metadata, current calls, historical aggregation, revision validation and forecast calculation.

Using the same fixed local database and the captured 44-period metadata, three samples reduced adapter results from 167,769 rows / 37.44 MB / 23 reads to 3,472 rows / 0.83 MB / 5 reads. Local medians were 1,100 ms before and 734 ms after; this local CPU/database comparison excludes Sites network round trips. Selected-week calls matched exactly and complete forecasts matched within floating-point summation tolerance. Six additional tests cover SQL aggregation, inclusive boundaries, plan differences, invalid usage/dates, gaps and historical selection. The root suite now passes 361 tests; Sites' 15 tests and TypeScript also pass.

A browser measurement of the version-52 refresh completed the forecast chart in **9,960 ms**, with **9,571 ms** in the detail request and approximately **53 ms** between its response and DOM update. Version 53 reduced the detail request to **3,904 ms**. Server timings identified remaining sequential per-machine reads and two sets of three metadata requests. The next revision batches metadata atomically and reads selected-week events across active machines with one shared keyset cursor. Tests verify cross-machine paging and both metadata adapter paths.

Version 54 was deployed successfully to the same owner-private Site. Three authenticated, uncached detail requests measured **3,971 / 2,767 / 2,112 ms** (all HTTP 200, ready forecasts). A full page reload displayed the forecast SVG after **4,408 ms**, including startup and metadata; its detail request took **2,148 ms**. These are observed production/browser timings, not local estimates. Evidence, Server-Timing headers and a screenshot are retained in `.cache/page-performance/weekly-chart-final.json`, `weekly-graph-reload-final.json` and `weekly-forecast-deployed.png`.
