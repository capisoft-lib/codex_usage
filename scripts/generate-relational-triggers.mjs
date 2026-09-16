// Only used when authoring migration 0006; never run against a live database.
import { readFileSync, writeFileSync } from "node:fs";
const file = new URL(
  "../sites-hub/drizzle/0006_relational_usage.sql",
  import.meta.url,
);
const marker =
  "-- Relational ingestion: atomic compatibility with existing signed agents.";
const base = readFileSync(file, "utf8")
  .split(marker)[0]
  .replace(/(?:\s*--> statement-breakpoint\s*)+$/, "")
  .trimEnd();
const j = (key) => `json_extract(value, '$.${key}')`;
const ms = (key) => `round((julianday(${j(key)}) - 2440587.5) * 86400000)`;
const counters = [
  "inputTokens",
  "cachedInputTokens",
  "outputTokens",
  "reasoningOutputTokens",
  "totalTokens",
  "cacheWriteInputTokens",
];
const values = counters.map((key) =>
  key === "cacheWriteInputTokens"
    ? j(`usage.${key}`)
    : `coalesce(${j(`usage.${key}`)}, 0)`,
);
const snake = (key) =>
  key.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
const update = (
  table,
  fields,
) => `ON CONFLICT(node_id,session_id,ordinal) DO UPDATE SET ${fields.map((key) => `${key}=excluded.${key}`).join(",")}
    WHERE (${fields.map((key) => `${table}.${key}`).join(",")}) IS NOT (${fields.map((key) => `excluded.${key}`).join(",")})`;
const callUpdate = update("usage_calls", [
  "timestamp",
  "timestamp_ms",
  "turn_id",
  "model",
  "effort",
  "service_tier",
  ...counters.map(snake),
]);
const turnUpdate = update("usage_turns", [
  "id",
  "started_at",
  "started_ms",
  "completed_at",
  "duration_ms",
  "model",
  "effort",
  "service_tier",
  "calls",
  ...counters.map(snake),
]);
const body = `
  DELETE FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.calls'),0);
  DELETE FROM usage_turns WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.turns'),0);
  DELETE FROM usage_session_models WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
  INSERT INTO usage_calls SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    ${j("timestamp")}, ${ms("timestamp")}, ${j("turnId")}, coalesce(${j("model")}, 'unknown'),
    ${j("effort")}, coalesce(${j("serviceTier")}, 'default'), ${values.join(", ")}
    FROM json_each(NEW.snapshot_json, '$.calls') WHERE true ${callUpdate};
  INSERT INTO usage_turns SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    ${j("id")}, ${j("startedAt")}, ${ms("startedAt")}, ${j("completedAt")}, ${j("durationMs")},
    coalesce(${j("model")}, 'unknown'), ${j("effort")}, coalesce(${j("serviceTier")}, 'default'),
    coalesce(${j("calls")}, 0), ${values.join(", ")}
    FROM json_each(NEW.snapshot_json, '$.turns') WHERE true ${turnUpdate};
  INSERT INTO usage_session_models SELECT NEW.node_id, NEW.session_id, value
    FROM json_each(NEW.snapshot_json, '$.models') WHERE typeof(value)='text' ON CONFLICT DO NOTHING;
  INSERT INTO usage_session_models SELECT node_id,session_id,model FROM usage_calls
    WHERE node_id=NEW.node_id AND session_id=NEW.session_id ON CONFLICT DO NOTHING;
  UPDATE mesh_sessions SET relational_version=CASE WHEN NEW.relational_version=2 THEN 1 ELSE 0 END,
    title=json_extract(NEW.snapshot_json,'$.title'), cwd=json_extract(NEW.snapshot_json,'$.cwd'),
    started_at=json_extract(NEW.snapshot_json,'$.startedAt'),
    first_call_day=(SELECT MIN(timestamp_ms)/86400000+2440587.5 FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id),
    last_call_day=(SELECT MAX(timestamp_ms)/86400000+2440587.5 FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id),
    invalid_call_dates=(SELECT COUNT(*) FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND timestamp_ms IS NULL)
    WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
  UPDATE mesh_sessions SET snapshot_json=json_remove(NEW.snapshot_json, '$.calls', '$.turns', '$.models')
    WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND NEW.relational_version=2;
`;
// Version 2 is the new writer's atomic opt-in to compact metadata. Until that
// writer is deployed, legacy writes keep their JSON readable by the old Worker.
// Version 0 is pending migration, 1 is normalized, 2 exists only inside a write.
const triggers = ["INSERT", "UPDATE OF snapshot_json"]
  .map(
    (
      event,
      i,
    ) => `CREATE TRIGGER mesh_sessions_relational_${i ? "update" : "insert"} AFTER ${event} ON mesh_sessions
WHEN NEW.relational_version IN (0,2) OR json_type(NEW.snapshot_json,'$.calls')='array' OR json_type(NEW.snapshot_json,'$.turns')='array'
BEGIN${body}END;`,
  )
  .join("\n--> statement-breakpoint\n");
writeFileSync(
  file,
  `${base}\n--> statement-breakpoint\n${marker}\nDROP TRIGGER IF EXISTS mesh_sessions_index_insert;\n--> statement-breakpoint\nDROP TRIGGER IF EXISTS mesh_sessions_index_update;\n--> statement-breakpoint\n${triggers}\n`,
);
