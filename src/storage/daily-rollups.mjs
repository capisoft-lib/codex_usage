export const DAY_MS = 86400000;

// The cache stores token counters, never prices. A new grouping definition
// invalidates its signature without rewriting previously deployed migrations.
export async function prepareDailyRollups(database, owner, cutoff, signature, expressions, {from = -8640000000000000, to = 8640000000000000} = {}) {
  const pending = await database.prepare(`SELECT d.node_id,d.session_id,d.day_ms FROM usage_rollup_days d
    JOIN mesh_nodes n ON n.id=d.node_id
    WHERE n.owner_id=? AND n.revoked_at IS NULL AND d.day_ms>=? AND d.day_ms<? AND (d.dirty=1 OR d.signature<>?)
    ORDER BY d.day_ms DESC,d.node_id,d.session_id LIMIT 128`)
    .bind(owner, Math.ceil(from/DAY_MS)*DAY_MS, Math.min(cutoff, Math.floor((to+1)/DAY_MS)*DAY_MS), signature).all();
  if (!pending.results?.length) return;
  // Four statements per batch, rather than four statements per
  // session-day. All rows and their clean markers still commit atomically.
  const keys = JSON.stringify(pending.results);
  const selected = `SELECT json_extract(value,'$.node_id'),json_extract(value,'$.session_id'),json_extract(value,'$.day_ms') FROM json_each(?)`;
  const cte = `WITH pending AS (SELECT json_extract(value,'$.node_id') node_id,json_extract(value,'$.session_id') session_id,json_extract(value,'$.day_ms') day_ms FROM json_each(?))`;
  await database.batch([
    database.prepare(`DELETE FROM usage_daily_rollups WHERE (node_id,session_id,day_ms) IN (${selected})`).bind(keys),
    database.prepare(`${cte} INSERT INTO usage_daily_rollups(node_id,session_id,day_ms,kind,ordinal,model,value)
      SELECT c.node_id,c.session_id,p.day_ms,'call',MIN(c.ordinal),c.model,${expressions.call}
      FROM pending p JOIN usage_calls c ON c.node_id=p.node_id AND c.session_id=p.session_id AND c.timestamp_ms>=p.day_ms AND c.timestamp_ms<p.day_ms+86400000
      GROUP BY c.node_id,c.session_id,p.day_ms,${expressions.group}`).bind(keys),
    database.prepare(`${cte} INSERT INTO usage_daily_rollups(node_id,session_id,day_ms,kind,ordinal,model,value)
      SELECT t.node_id,t.session_id,p.day_ms,'turn',MIN(t.ordinal),t.model,${expressions.turn}
      FROM pending p JOIN usage_turns t ON t.node_id=p.node_id AND t.session_id=p.session_id AND t.started_ms>=p.day_ms AND t.started_ms<p.day_ms+86400000
      GROUP BY t.node_id,t.session_id,p.day_ms,t.model`).bind(keys),
    database.prepare(`UPDATE usage_rollup_days SET dirty=0,signature=? WHERE (node_id,session_id,day_ms) IN (${selected})`).bind(signature,keys),
  ]);
  // Missing/dirty days remain on the raw query path; partial cache construction
  // never hides history, requires a blocking migration, or returns partial totals.
}

export function eligibleRollupDay(lower, upper, cutoff, boundaries, signature) {
  // A boundary exactly at UTC midnight cannot split the contents of a day.
  const blocked = [...new Set(boundaries.filter(value => Number.isFinite(value) && value % DAY_MS !== 0).map(value => Math.floor(value / DAY_MS) * DAY_MS))];
  const first = Math.ceil(lower / DAY_MS) * DAY_MS;
  const end = Math.min(cutoff, Math.floor((upper + 1) / DAY_MS) * DAY_MS);
  return `d.dirty=0 AND d.signature='${signature}' AND d.day_ms>=${first} AND d.day_ms<${end}${blocked.length ? ` AND d.day_ms NOT IN (${blocked.join(',')})` : ''}`;
}
