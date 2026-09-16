# Relational storage

The dashboard uses embedded SQLite on Node.js and in Docker, and Cloudflare D1 on Sites. The schema and read queries are shared. No SQL server, container, account or connection string is required for local operation.

Node.js **22.13 or newer** is required because the application uses `node:sqlite`. The Docker image already supplies Node 22. The optional desktop helper supplies its own compatible Node runtime through Electron.

## Data model

`sites-hub/db/schema.ts` and its committed Drizzle migrations define both databases:

| Table | Purpose |
| --- | --- |
| `mesh_nodes` | Machine identities, ownership, revocation and signed sequence counters |
| `mesh_enrollments` | One-time, hashed association codes |
| `mesh_sessions` | Session identity, indexed date bounds, title, project path and secondary metadata |
| `usage_calls` | One row per model call, including timestamp, model, effort, tier and token counters |
| `usage_turns` | One row per exchange, linked to its session, with timing and counters |
| `usage_session_models` | Session/model membership used by filter selectors |
| `dashboard_preferences` | Owner preferences |

Calls, exchanges and model membership have composite foreign keys to sessions, with cascading deletion. Event ordinals preserve multiple calls with identical timestamps or turn IDs. The optional cache-write counter remains nullable: an unobserved value is different from an observed zero.

JSON remains for the network protocol, secondary metadata, quota observations and the small local agent identity file. It is no longer the primary query representation for calls or exchanges. Original Codex JSONL logs remain read-only source data.

## Reads and writes

The overview, project and conversation views filter relational records by time, machine, project and model. SQLite performs grouping before returning data to JavaScript. Pricing groups preserve UTC pricing dates, historical rates, context thresholds, tier, effort, cache-write evidence and graph bucket boundaries. They contain token sums and call counts; prices remain dynamically computed from the shared catalog or custom user prices. No stale monetary totals are persisted.

Detailed conversations and pricing reports read individual events on demand. Quota forecasting also reads individual calls because it needs their precise times. The legacy full `/api/usage` export remains compatible and necessarily materializes its full result. Conversation summaries are sorted and paginated by the shared presentation code, preserving locale-aware sorting and custom pricing; database reads use keyset batches of 128 sessions.

Local refreshes compare session references and content hashes. Unchanged sessions are not rewritten. Changed sessions upsert events by ordinal, update only changed rows and remove vanished events. Metadata, removals, events and the refresh checkpoint commit together. Serialization of the full public export is lazy.

Local SQLite uses foreign keys, WAL, a five-second busy timeout and `synchronous=FULL`. The signed Mesh replay counter and ingested changes commit in the same transaction. D1 uses its atomic batch API and ingestion triggers, retaining compatibility with existing reporting agents.

## Local and Docker migration

By default:

- Local usage: `.cache/usage-snapshot.json.sqlite`.
- Local Mesh hub: `.cache/mesh-hub.json.sqlite`.
- Docker: the same filenames under the existing `/app-cache` volume.

`SNAPSHOT_PATH` and `MESH_HUB_PATH` keep their role as legacy import sources. The default SQLite filename appends `.sqlite` to those paths; an explicit `.sqlite` or `.db` path is used directly. `USAGE_DATABASE_PATH` and `MESH_DATABASE_PATH` optionally override the destination. An empty `SNAPSHOT_PATH` uses in-memory SQLite unless an explicit database path is provided.

The first start imports the old JSON transactionally and keeps that file untouched. Later starts prefer SQLite, so an old JSON file cannot overwrite newer data. Hub import preserves enrollment codes, public keys, fingerprints, revoked machines, sequence counters, quota history and sessions. An invalid hub import fails rather than silently generating new identities.

Do not remove the Docker volume when replacing a container. Keep SQLite on a local filesystem or a Docker volume, not an SMB/NFS shared file. Separate replicas should use their own databases and synchronize through Mesh, rather than sharing a SQLite file across hosts.

## Sites migration and deployment ordering

Migrations `0006` and `0007` create the relational tables, ingestion triggers and indexes. Older applied migrations and their snapshots remain unchanged. Apply the generated migrations through the normal Sites deployment workflow.

Schema installation alone does not strip the JSON that the previous Worker reads. Legacy writers continue to populate it until the new application opts into relational storage. This matters because Sites may apply migrations before uploading a new Worker, and that upload can fail.

The new writer uses a transient `relational_version=2` inside its atomic write. The trigger extracts relational rows, sets version 1 and removes the large event arrays from session metadata. Legacy writes stay at version 0; the reader migrates them in transactions of 25 sessions. A request processes at most 500 old sessions, then returns a specific `503 storage_migrating` response if more remain. The dashboard automatically retries only that response, with cancellation and a retry limit. It never displays partial migration results. Completed batches survive an interruption and resume on the next request.

After data compaction, rolling back to an old application requires restoring a matching database backup; the old reader cannot reconstruct removed JSON arrays. Keep a backup before the first deployment. Do not rewrite applied migration files. The trigger-generation script is a source-authoring helper for migration 0006, not an operational migration command.

## Historical aggregates

Migration `0008` adds a durable daily aggregate cache. Summary reads covering at least 28 days use it for complete UTC days in finished UTC months. Calls remain available for details, pricing exports and short zooms. Any day touched by a graph boundary or a partial range is read from detailed rows, preserving local-time month boundaries and inclusive endpoints.

The cache retains session identity, model, effort, tier, pricing date, context bands, cache evidence, token sums and event counts. Prices remain dynamic. Each request prepares up to 25 pending days in one atomic batch; days not yet prepared use the existing detailed query, so the first visits can still be slower. Automatic page polling continues preparation even when an unchanged response returns HTTP 304. Subsequent reads reuse the durable cache. There is no global history lock or partial result.

Database triggers mark only affected days dirty when calls or turns are inserted, corrected, moved or deleted. The next summary request rebuilds those days. Unchanged history stays cached, and session deletion cascades to the cache. A grouping signature protects against changed pricing-context thresholds. Raw fallback remains available during preparation.

Run `node scripts/benchmark-rollups.mjs` for a synthetic 200,000-call comparison with exact result checks. On Node 24, one local measurement was 487 ms without the cache versus 23 ms warm, with 309 ms of initial preparation. This is not a production D1 latency claim.

## Backups

For local SQLite, use SQLite's backup facilities or `VACUUM INTO` to take a consistent live backup. Alternatively, stop all processes using the database, then copy it after clean shutdown. Do not copy only the main file while a writer is active: recent commits may still be in its `-wal` file. Retain the original JSON import until the migration has been validated, but remember that it does not contain subsequent writes.

Use the Sites/D1 backup or export mechanism for hosted data. This branch's tests operate on temporary fixtures; implementation and validation do not migrate the production Site.

## Verification and performance

```sh
npm run check
npm test --prefix sites-hub
npm run typecheck --prefix sites-hub
npm run lint --prefix sites-hub
npm run benchmark:storage
docker build --target dashboard -t codex-usage-dashboard:relational-test .
npm run test:storage:docker
```

The benchmark generates synthetic history and checks identical call counts and costs. It compares the previous local JSON path, the previous hosted JSON-filtering approach and relational grouping using the same local SQLite runtime. It reports median timings over five runs and bytes returned by the storage adapter. These are query/aggregation measurements, not production D1 network latency or a guarantee for every dataset.

Example measured on Node 24.19, with 200 sessions and 200,000 calls:

| Range | Previous local JSON | Previous hosted query, measured locally | Relational |
| --- | ---: | ---: | ---: |
| Full history | 1,265 ms | 1,776 ms | 359 ms |
| 15-minute window | 233 ms | 281 ms | 17 ms |

For the full-history query, adapter output decreased from 44.8 MB of session JSON to about 115 KB of grouped data. Real-world gains depend on date ranges, event distribution, model/tier diversity and network latency. No production performance measurement is implied.

Tests cover legacy import and restart, atomic rollback, cascading deletion, duplicate calls, invalid dates, nullable counters, cross-owner isolation, revoked nodes, preserved replay counters, historical/current/custom prices and arbitrary graph boundaries. A separate Miniflare/workerd test executes the real D1 API and checks that appending one event does not rewrite 1,000 unchanged rows. The Docker smoke test uses temporary containers and a temporary volume, verifies persistence across container replacement, and cleans them up.
