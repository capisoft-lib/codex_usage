import { PRICING_CATALOG } from "../../public/pricing-catalog.js";
// Shared D1/SQLite queries. JSON is only the transport format; all event filters
// use relational columns and indexes rather than parsing complete snapshots.
export class StorageMigrationPending extends Error {
  constructor() {
    super("Migration du stockage en cours. Réessayez dans quelques instants.");
    this.status = 503;
    this.code = "storage_migrating";
  }
}

export async function migrateLegacySessions(database, owner) {
  const pendingSql = `SELECT 1 FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id WHERE s.relational_version=0 AND n.owner_id=? LIMIT 1`;
  if (!(await database.prepare(pendingSql).bind(owner).first())) return;
  // Bound first-request work on Workers. Each batch is atomic and restartable;
  // no partially migrated result is ever returned to the dashboard.
  for (let batch = 0; batch < 20; batch++) {
    const result = await database
      .prepare(
        `UPDATE mesh_sessions SET relational_version=2,snapshot_json=snapshot_json
      WHERE (node_id,session_id) IN (SELECT s.node_id,s.session_id FROM mesh_sessions s
        JOIN mesh_nodes n ON n.id=s.node_id WHERE n.owner_id=? AND s.relational_version=0 LIMIT 25)`,
      )
      .bind(owner)
      .run();
    if (result.meta.changes < 25) return;
  }
  const pending = await database.prepare(pendingSql).bind(owner).first();
  if (pending) throw new StorageMigrationPending();
}

const usage = (
  a,
) => `json_patch(json_object('inputTokens',${a}.input_tokens,'cachedInputTokens',${a}.cached_input_tokens,
  'outputTokens',${a}.output_tokens,'reasoningOutputTokens',${a}.reasoning_output_tokens,'totalTokens',${a}.total_tokens),
  CASE WHEN ${a}.cache_write_input_tokens IS NULL THEN '{}' ELSE json_object('cacheWriteInputTokens',${a}.cache_write_input_tokens) END)`;
const call = `json_object('timestamp',c.timestamp,'turnId',c.turn_id,'model',c.model,'effort',c.effort,'serviceTier',c.service_tier,'usage',json(${usage("c")}))`;
const turn = `json_object('id',t.id,'startedAt',t.started_at,'completedAt',t.completed_at,'durationMs',t.duration_ms,
  'model',t.model,'effort',t.effort,'serviceTier',t.service_tier,'calls',t.calls,'usage',json(${usage("t")}))`;

export async function readSessionSlices(
  database,
  owner,
  from,
  to,
  includeInvalid,
  id,
  consume,
  callsOnly = false,
  options = {},
) {
  await migrateLegacySessions(database, owner);
  const lower = Number.isFinite(Date.parse(from))
    ? Date.parse(from)
    : -8640000000000000;
  const upper = Number.isFinite(Date.parse(to))
    ? Date.parse(to)
    : 8640000000000000;
  const range = `(c.timestamp_ms BETWEEN ${lower} AND ${upper}${includeInvalid ? " OR c.timestamp_ms IS NULL" : ""})`;
  const model = options.model && options.model !== "all" ? options.model : null;
  // Totals plus per-call context bands retain prices, including historical day,
  // fast tiers, long-context bands and cache-write evidence. Invalid usage stays
  // one row per event. Group boundaries also preserve arbitrary graph buckets.
  const thresholds = [
    ...new Set(
      PRICING_CATALOG.map((rate) => rate.longContextThreshold).filter(Boolean),
    ),
  ];
  const boundaries = [
    ...new Set(
      (options.buckets || []).flatMap((b) => [
        Date.parse(b.start),
        Date.parse(b.end),
      ]),
    ),
  ]
    .filter(Number.isFinite)
    .sort((a, b) => a - b);
  const segment = boundaries.length
    ? `CASE ${boundaries.map((value, i) => `WHEN c.timestamp_ms<${value} THEN ${i * 2} WHEN c.timestamp_ms=${value} THEN ${i * 2 + 1}`).join(" ")} ELSE ${boundaries.length * 2} END`
    : "(0+0)";
  const invalid = `c.input_tokens<0 OR c.cached_input_tokens<0 OR c.output_tokens<0 OR coalesce(c.cache_write_input_tokens,0)<0 OR c.cached_input_tokens+coalesce(c.cache_write_input_tokens,0)>c.input_tokens`;
  const groupBy = `date(c.timestamp_ms/1000,'unixepoch'),c.model,c.effort,c.service_tier,
    ${thresholds.map((value) => `(c.input_tokens>${value}),`).join("")}
    (c.cache_write_input_tokens IS NULL),(coalesce(c.cache_write_input_tokens,0)>0),
    (c.input_tokens>c.cached_input_tokens),(c.input_tokens-c.cached_input_tokens-coalesce(c.cache_write_input_tokens,0)>0),(c.output_tokens>0),
    CASE WHEN ${invalid} THEN c.ordinal ELSE -1 END,${segment}`;
  const aggregateUsage = `json_patch(json_object('inputTokens',AVG(c.input_tokens),'cachedInputTokens',AVG(c.cached_input_tokens),
    'outputTokens',AVG(c.output_tokens),'reasoningOutputTokens',AVG(c.reasoning_output_tokens),'totalTokens',AVG(c.total_tokens)),
    CASE WHEN c.cache_write_input_tokens IS NULL THEN '{}' ELSE json_object('cacheWriteInputTokens',AVG(c.cache_write_input_tokens)) END)`;
  const groupedCall = `json_object('_count',COUNT(*),'timestamp',MAX(c.timestamp),'model',c.model,'effort',c.effort,'serviceTier',c.service_tier,'usage',json(${aggregateUsage}),
    '_totals',json(${aggregateUsage.replaceAll("AVG(", "SUM(")}))`;
  const calls = `(SELECT json_group_array(json(value)) FROM (SELECT ${options.aggregate ? groupedCall : call} AS value FROM usage_calls c
    WHERE c.node_id=s.node_id AND c.session_id=s.session_id AND ${range}
    ${model ? "AND c.model=?" : ""} ${options.aggregate ? `GROUP BY ${groupBy} ORDER BY MIN(c.ordinal)` : "ORDER BY c.ordinal"}))`;
  const groupedTurn = `json_object('_count',COUNT(*),'startedAt',MAX(t.started_at),'model',t.model,'durationMs',SUM(t.duration_ms))`;
  const turns = `(SELECT json_group_array(json(value)) FROM (SELECT ${options.aggregate ? groupedTurn : turn} AS value FROM usage_turns t
    WHERE t.node_id=s.node_id AND t.session_id=s.session_id
    AND (t.started_ms BETWEEN ${lower} AND ${upper}${includeInvalid ? " OR t.started_ms IS NULL" : ""})
    ${model ? "AND t.model=?" : ""} ${options.aggregate ? "GROUP BY t.model" : "ORDER BY t.ordinal"}))`;
  const models = `(SELECT json_group_array(model) FROM usage_session_models m WHERE m.node_id=s.node_id AND m.session_id=s.session_id)`;
  const projection = callsOnly
    ? `json_object('calls',json(${calls}))`
    : `json_patch(s.snapshot_json,json_object('models',json(${models}),'calls',json(${calls}),'turns',json(${turns})))`;
  let cursorNode = "",
    cursorSession = "";
  for (;;) {
    const values = model ? (callsOnly ? [model] : [model, model]) : [];
    values.push(owner, cursorNode, cursorSession);
    let where = "";
    if (id) {
      const separator = id.indexOf(":");
      if (separator < 1) return;
      where += " AND s.node_id=? AND s.session_id=?";
      values.push(id.slice(0, separator), id.slice(separator + 1));
    }
    if (options.sessionId) {
      where += " AND s.session_id=?";
      values.push(options.sessionId);
    }
    if (options.node && options.node !== "all") {
      where += " AND s.node_id=?";
      values.push(options.node);
    }
    if (options.folders?.length) {
      where += " AND coalesce(s.cwd,'') IN (SELECT value FROM json_each(?))";
      values.push(JSON.stringify(options.folders));
    }
    if (!options.allSessions) {
      where += ` AND (s.last_call_day>=${lower / 86400000 + 2440587.5} AND s.first_call_day<=${upper / 86400000 + 2440587.5}${includeInvalid ? " OR s.invalid_call_dates>0" : ""})
        AND EXISTS (SELECT 1 FROM usage_calls c WHERE c.node_id=s.node_id AND c.session_id=s.session_id AND ${range}${model ? " AND c.model=?" : ""})`;
      if (model) values.push(model);
    }
    const result = await database
      .prepare(
        `SELECT s.node_id,s.session_id,${projection} AS snapshot_json
      FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id
      WHERE n.owner_id=? AND n.revoked_at IS NULL AND (s.node_id,s.session_id)>(?,?)${where}
      ORDER BY s.node_id,s.session_id LIMIT 128`,
      )
      .bind(...values)
      .all();
    const rows = result.results || [];
    for (const row of rows) await consume(row);
    if (rows.length < 128) break;
    cursorNode = rows.at(-1).node_id;
    cursorSession = rows.at(-1).session_id;
  }
}

export async function readFilters(database, owner) {
  const [folders, models] = await Promise.all([
    database
      .prepare(
        `SELECT DISTINCT coalesce(s.cwd,'') AS cwd FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id WHERE n.owner_id=? AND n.revoked_at IS NULL`,
      )
      .bind(owner)
      .all(),
    database
      .prepare(
        `SELECT DISTINCT m.model FROM usage_session_models m JOIN mesh_nodes n ON n.id=m.node_id WHERE n.owner_id=? AND n.revoked_at IS NULL`,
      )
      .bind(owner)
      .all(),
  ]);
  return {
    folders: (folders.results || []).map((row) => row.cwd),
    models: (models.results || []).map((row) => row.model),
  };
}

export function countersFromRow(row) {
  return {
    inputTokens: row.input_tokens,
    cachedInputTokens: row.cached_input_tokens,
    outputTokens: row.output_tokens,
    reasoningOutputTokens: row.reasoning_output_tokens,
    totalTokens: row.total_tokens,
    ...(row.cache_write_input_tokens == null
      ? {}
      : { cacheWriteInputTokens: row.cache_write_input_tokens }),
  };
}
export function callFromRow(row) {
  return {
    timestamp: row.timestamp,
    turnId: row.turn_id,
    model: row.model,
    effort: row.effort,
    serviceTier: row.service_tier,
    usage: countersFromRow(row),
  };
}
export function turnFromRow(row) {
  return {
    id: row.id,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    durationMs: row.duration_ms,
    model: row.model,
    effort: row.effort,
    serviceTier: row.service_tier,
    calls: row.calls,
    usage: countersFromRow(row),
  };
}
