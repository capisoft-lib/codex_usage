// Authoring helper for the new, unapplied 0008 migration only.
import { appendFileSync, readFileSync } from 'node:fs';
const file = new URL('../sites-hub/drizzle/0008_keen_the_enforcers.sql', import.meta.url);
if (readFileSync(file, 'utf8').includes('usage_calls_rollup_insert')) throw new Error('Already generated');
const day = value => `(${value} - ((${value} % 86400000 + 86400000) % 86400000))`;
const statements = [];
for (const [table, time] of [['usage_calls', 'timestamp_ms'], ['usage_turns', 'started_ms']]) {
  statements.push(`INSERT INTO usage_rollup_days(node_id,session_id,day_ms)
    SELECT node_id,session_id,${day(time)} FROM ${table} WHERE ${time} IS NOT NULL GROUP BY node_id,session_id,${day(time)}
    ON CONFLICT DO NOTHING;`);
  const invalidate = row => `INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT ${row}.node_id,${row}.session_id,${day(`${row}.${time}`)},1
    WHERE ${row}.${time} IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=${row}.node_id AND session_id=${row}.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1;`;
  for (const [event, rows] of [['INSERT',['NEW']], ['UPDATE',['OLD','NEW']], ['DELETE',['OLD']]]) {
    statements.push(`CREATE TRIGGER ${table}_rollup_${event.toLowerCase()} AFTER ${event} ON ${table}
      BEGIN ${rows.map(invalidate).join('\n')} END;`);
  }
}
appendFileSync(file, '\n--> statement-breakpoint\n' + statements.join('\n--> statement-breakpoint\n') + '\n');
