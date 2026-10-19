import { PRICING_CATALOG } from "../../public/pricing-catalog.js";
import { DAY_MS, prepareDailyRollups, eligibleRollupDay } from './daily-rollups.mjs';
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
  const dailyGroupBy = `date(c.timestamp_ms/1000,'unixepoch'),c.model,c.effort,c.service_tier,
    ${thresholds.map((value) => `(c.input_tokens>${value}),`).join("")}
    (c.cache_write_input_tokens IS NULL),(coalesce(c.cache_write_input_tokens,0)>0),
    (c.input_tokens>c.cached_input_tokens),(c.input_tokens-c.cached_input_tokens-coalesce(c.cache_write_input_tokens,0)>0),(c.output_tokens>0),
    CASE WHEN ${invalid} THEN c.ordinal ELSE -1 END`;
  const groupBy = `${dailyGroupBy},${segment}`;
  const aggregateUsage = `json_patch(json_object('inputTokens',AVG(c.input_tokens),'cachedInputTokens',AVG(c.cached_input_tokens),
    'outputTokens',AVG(c.output_tokens),'reasoningOutputTokens',AVG(c.reasoning_output_tokens),'totalTokens',AVG(c.total_tokens)),
    CASE WHEN c.cache_write_input_tokens IS NULL THEN '{}' ELSE json_object('cacheWriteInputTokens',AVG(c.cache_write_input_tokens)) END)`;
  const groupedCall = `json_object('_count',COUNT(*),'timestamp',MAX(c.timestamp),'model',c.model,'effort',c.effort,'serviceTier',c.service_tier,'usage',json(${aggregateUsage}),
    '_totals',json(${aggregateUsage.replaceAll("AVG(", "SUM(")}))`;
  const groupedTurn = `json_object('_count',COUNT(*),'startedAt',MAX(t.started_at),'model',t.model,'durationMs',SUM(t.duration_ms))`;
  const now = new Date();
  const cutoff = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const useRollups = options.aggregate && !includeInvalid && options.rollups !== false && database.batch && lower < cutoff && upper-lower >= DAY_MS;
  const signature = `v1_${thresholds.join('_')}`;
  let eligible = '';
  if (useRollups) {
    if (options.prepareCache !== false) await prepareDailyRollups(database, owner, cutoff, signature, { call: groupedCall, turn: groupedTurn, group: dailyGroupBy }, {from:lower, to:upper});
    eligible = eligibleRollupDay(lower,upper,cutoff,boundaries,signature);
  }
  if (options.prepareOnly) return;
  const rawSource = (table,alias,index) => useRollups ? `usage_rollup_days rd CROSS JOIN ${table} ${alias} INDEXED BY ${index}` : `${table} ${alias}`;
  const rawOnly = (alias,time) => useRollups ? `AND rd.node_id=s.node_id AND rd.session_id=s.session_id
    AND rd.day_ms>=${Math.floor(lower/DAY_MS)*DAY_MS} AND rd.day_ms<=${Math.floor(upper/DAY_MS)*DAY_MS}
    AND NOT (${eligible.replaceAll('d.','rd.')}) AND ${time}>=rd.day_ms AND ${time}<rd.day_ms+86400000` : '';
  const cached = kind => useRollups ? `SELECT r.value,r.ordinal AS sort_ordinal FROM usage_daily_rollups r JOIN usage_rollup_days d
    ON d.node_id=r.node_id AND d.session_id=r.session_id AND d.day_ms=r.day_ms
    WHERE r.node_id=s.node_id AND r.session_id=s.session_id AND r.kind='${kind}' AND ${eligible}
    ${model ? `AND r.model='${model.replaceAll("'", "''")}'` : ''} UNION ALL ` : '';
  const calls = `(SELECT json_group_array(json(value)) FROM (${cached('call')}SELECT ${options.aggregate ? groupedCall : call} AS value,${options.aggregate ? 'MIN(c.ordinal)' : 'c.ordinal'} AS sort_ordinal FROM ${rawSource('usage_calls','c','usage_calls_session_time')}
    WHERE c.node_id=s.node_id AND c.session_id=s.session_id AND ${range}
    ${rawOnly('c','c.timestamp_ms')} ${model ? "AND c.model=?" : ""} ${options.aggregate ? `GROUP BY ${groupBy}` : ''} ORDER BY sort_ordinal))`;
  const turns = `(SELECT json_group_array(json(value)) FROM (${cached('turn')}SELECT ${options.aggregate ? groupedTurn : turn} AS value,${options.aggregate ? 'MIN(t.ordinal)' : 't.ordinal'} AS sort_ordinal FROM ${rawSource('usage_turns','t','usage_turns_session_time')}
    WHERE t.node_id=s.node_id AND t.session_id=s.session_id
    AND (t.started_ms BETWEEN ${lower} AND ${upper}${includeInvalid ? " OR t.started_ms IS NULL" : ""})
    ${rawOnly('t','t.started_ms')} ${model ? "AND t.model=?" : ""} ${options.aggregate ? "GROUP BY t.model" : ''} ORDER BY sort_ordinal))`;
  const models = `(SELECT json_group_array(model) FROM usage_session_models m WHERE m.node_id=s.node_id AND m.session_id=s.session_id)`;
  const projection = callsOnly
    ? `json_object('calls',json(${calls}))`
    : `json_patch(s.snapshot_json,json_object('models',json(${models}),'calls',json(${calls}),'turns',json(${turns})))`;
  let cursorNode = "",
    cursorSession = "";
  // Summary pages transfer compact aggregates, so use fewer D1 round trips.
  // Raw detail/export reads keep the smaller memory-bounded batches.
  const batchSize = options.aggregate ? 1024 : 128;
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
        `WITH page AS MATERIALIZED (
      SELECT s.node_id,s.session_id,s.snapshot_json
      FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id
      WHERE n.owner_id=? AND n.revoked_at IS NULL AND (s.node_id,s.session_id)>(?,?)${where}
      ORDER BY s.node_id,s.session_id LIMIT ${batchSize})
      SELECT s.node_id,s.session_id,${projection} AS snapshot_json FROM page s
      ORDER BY s.node_id,s.session_id`,
      )
      .bind(...(model ? [...values.slice(callsOnly ? 1 : 2), ...values.slice(0, callsOnly ? 1 : 2)] : values))
      .all();
    const rows = result.results || [];
    for (const row of rows) await consume(row);
    if (rows.length < batchSize) break;
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

// Quota forecasts need exact event times, but no conversation metadata or turns.
// Bound by events rather than sessions: a single long conversation cannot grow
// a database response without limit. Keep session/ordinal order for accounting.
export async function readQuotaCalls(database, owner, from, to, consume) {
  await migrateLegacySessions(database, owner);
  const lower = Date.parse(from), upper = Date.parse(to);
  if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) throw new Error('Invalid quota range');
  const batchSize = 8192;
  let cursor = null;
    for (;;) {
      // Short transport keys avoid repeating verbose column names for thousands
      // of events over D1; the public event contract is reconstructed below.
      const result = await database.prepare(`SELECT c.session_id AS s,c.ordinal AS o,c.node_id AS n,
        c.timestamp AS t,c.turn_id AS u,c.model AS m,c.effort AS e,c.service_tier AS r,
        c.input_tokens AS i,c.cached_input_tokens AS k,c.output_tokens AS p,
        c.reasoning_output_tokens AS z,c.total_tokens AS a,c.cache_write_input_tokens AS w FROM usage_calls c
        JOIN mesh_nodes n ON n.id=c.node_id
        WHERE n.owner_id=? AND n.revoked_at IS NULL
        ${cursor ? 'AND (c.node_id,c.session_id,c.ordinal)>(?,?,?)' : ''}
        AND (c.timestamp_ms BETWEEN ? AND ? OR c.timestamp_ms IS NULL)
        ORDER BY c.node_id,c.session_id,c.ordinal LIMIT ${batchSize}`)
        .bind(owner, ...(cursor || []), lower, upper).all();
      const rows = result.results || [];
      for (const row of rows) consume({timestamp:row.t,turnId:row.u,model:row.m,effort:row.e,serviceTier:row.r,
        usage:{inputTokens:row.i,cachedInputTokens:row.k,outputTokens:row.p,reasoningOutputTokens:row.z,totalTokens:row.a,
          ...(row.w == null ? {} : {cacheWriteInputTokens:row.w})}}, row.n);
      if (rows.length < batchSize) break;
      cursor = [rows.at(-1).n, rows.at(-1).s, rows.at(-1).o];
    }
}

// Forecast calibration only needs totals inside each observation window. One
// owner-scoped SQL aggregation replaces months of raw-event network batches.
// UTC pricing days and every inclusive period boundary remain distinct.
export async function readQuotaCalibration(database, owner, windows, node, consume) {
  if (!windows.length) return;
  const boundaries=[...new Set(windows.flatMap(w=>[w.start,w.end]))].sort((a,b)=>a-b);
  if (boundaries.some(value=>!Number.isFinite(value))) throw new Error('Invalid calibration range');
  const segment=`CASE ${boundaries.map((value,i)=>`WHEN c.timestamp_ms<${value} THEN ${i*2} WHEN c.timestamp_ms=${value} THEN ${i*2+1}`).join(' ')} ELSE ${boundaries.length*2} END`;
  await readQuotaGroups(database,owner,boundaries[0],boundaries.at(-1),node,segment,true,consume);
}

// Older EMA samples need their exact hour relative to this forecast's anchor,
// not each event. Pricing days, invalid gaps and subscription tiers stay distinct.
export async function readQuotaSamples(database,owner,from,to,anchor,node,consume) {
  if (to<from) return;
  if (![from,to,anchor].every(Number.isFinite)) throw new Error('Invalid sample range');
  await readQuotaGroups(database,owner,from,to,node,`CAST((${anchor}-c.timestamp_ms)/3600000 AS INTEGER)`,false,consume);
}

// Called after readQuotaCalls has completed legacy migration for this request.
async function readQuotaGroups(database,owner,from,to,node,segment,includeInvalid,consume) {
  const invalid=`c.input_tokens<0 OR c.cached_input_tokens<0 OR c.output_tokens<0 OR coalesce(c.cache_write_input_tokens,0)<0 OR c.cached_input_tokens+coalesce(c.cache_write_input_tokens,0)>c.input_tokens`;
  const result=await database.prepare(`SELECT c.node_id,MAX(c.timestamp) AS timestamp,c.model,c.service_tier,
    SUM(c.input_tokens) AS input_tokens,SUM(c.cached_input_tokens) AS cached_input_tokens,
    SUM(c.output_tokens) AS output_tokens,SUM(c.reasoning_output_tokens) AS reasoning_output_tokens,
    SUM(c.total_tokens) AS total_tokens,SUM(c.cache_write_input_tokens) AS cache_write_input_tokens,
    MAX(CASE WHEN ${invalid} THEN 1 ELSE 0 END) AS invalid_usage
    FROM usage_calls c JOIN mesh_nodes n ON n.id=c.node_id
    WHERE n.owner_id=? AND n.revoked_at IS NULL ${node?'AND c.node_id=?':''}
    AND (c.timestamp_ms BETWEEN ? AND ? ${includeInvalid?'OR c.timestamp_ms IS NULL':''})
    GROUP BY c.node_id,date(c.timestamp_ms/1000,'unixepoch'),c.model,c.service_tier,${segment},CASE WHEN ${invalid} THEN 1 ELSE 0 END`)
    .bind(owner,...(node?[node]:[]),from,to).all();
  for (const row of result.results || []) consume({...callFromRow(row),_invalidUsage:Boolean(row.invalid_usage)},row.node_id);
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
