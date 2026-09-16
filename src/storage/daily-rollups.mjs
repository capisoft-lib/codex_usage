export const DAY_MS = 86400000;

// The cache stores token counters, never prices. A new grouping definition
// invalidates its signature without rewriting previously deployed migrations.
export async function prepareDailyRollups(database, owner, cutoff, signature, expressions) {
  const pending = await database.prepare(`SELECT d.node_id,d.session_id,d.day_ms FROM usage_rollup_days d
    JOIN mesh_nodes n ON n.id=d.node_id
    WHERE n.owner_id=? AND n.revoked_at IS NULL AND d.day_ms<? AND (d.dirty=1 OR d.signature<>?)
    ORDER BY d.node_id,d.session_id,d.day_ms LIMIT 25`).bind(owner, cutoff, signature).all();
  const statements = [];
  for (const d of pending.results || []) {
    const keys = [d.node_id, d.session_id, d.day_ms];
    statements.push(
      database.prepare('DELETE FROM usage_daily_rollups WHERE node_id=? AND session_id=? AND day_ms=?').bind(...keys),
      database.prepare(`INSERT INTO usage_daily_rollups(node_id,session_id,day_ms,kind,ordinal,model,value)
        SELECT c.node_id,c.session_id,?,'call',MIN(c.ordinal),c.model,${expressions.call}
        FROM usage_calls c WHERE c.node_id=? AND c.session_id=? AND c.timestamp_ms>=? AND c.timestamp_ms<?
        GROUP BY ${expressions.group}`).bind(d.day_ms,d.node_id,d.session_id,d.day_ms,d.day_ms+DAY_MS),
      database.prepare(`INSERT INTO usage_daily_rollups(node_id,session_id,day_ms,kind,ordinal,model,value)
        SELECT t.node_id,t.session_id,?,'turn',MIN(t.ordinal),t.model,${expressions.turn}
        FROM usage_turns t WHERE t.node_id=? AND t.session_id=? AND t.started_ms>=? AND t.started_ms<?
        GROUP BY t.model`).bind(d.day_ms,d.node_id,d.session_id,d.day_ms,d.day_ms+DAY_MS),
      database.prepare('UPDATE usage_rollup_days SET dirty=0,signature=? WHERE node_id=? AND session_id=? AND day_ms=?').bind(signature,...keys),
    );
  }
  if (statements.length) await database.batch(statements);
  // Missing/dirty days remain on the raw query path; partial cache construction
  // never hides history, requires a blocking migration, or returns partial totals.
}

export function eligibleRollupDay(lower, upper, cutoff, boundaries, signature) {
  const blocked = [...new Set(boundaries.filter(Number.isFinite).map(value => Math.floor(value / DAY_MS) * DAY_MS))];
  const first = Math.ceil(lower / DAY_MS) * DAY_MS;
  const end = Math.min(cutoff, Math.floor((upper + 1) / DAY_MS) * DAY_MS);
  return `d.dirty=0 AND d.signature='${signature}' AND d.day_ms>=${first} AND d.day_ms<${end}${blocked.length ? ` AND d.day_ms NOT IN (${blocked.join(',')})` : ''}`;
}
