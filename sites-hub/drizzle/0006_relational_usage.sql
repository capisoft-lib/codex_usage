CREATE TABLE `usage_calls` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`timestamp` text,
	`timestamp_ms` real,
	`turn_id` text,
	`model` text NOT NULL,
	`effort` text,
	`service_tier` text NOT NULL,
	`input_tokens` real DEFAULT 0 NOT NULL,
	`cached_input_tokens` real DEFAULT 0 NOT NULL,
	`output_tokens` real DEFAULT 0 NOT NULL,
	`reasoning_output_tokens` real DEFAULT 0 NOT NULL,
	`total_tokens` real DEFAULT 0 NOT NULL,
	`cache_write_input_tokens` real,
	PRIMARY KEY(`node_id`, `session_id`, `ordinal`),
	FOREIGN KEY (`node_id`,`session_id`) REFERENCES `mesh_sessions`(`node_id`,`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_calls_node_time` ON `usage_calls` (`node_id`,`timestamp_ms`,`session_id`);--> statement-breakpoint
CREATE INDEX `usage_calls_session_time` ON `usage_calls` (`node_id`,`session_id`,`timestamp_ms`);--> statement-breakpoint
CREATE TABLE `usage_session_models` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`model` text NOT NULL,
	PRIMARY KEY(`node_id`, `session_id`, `model`),
	FOREIGN KEY (`node_id`,`session_id`) REFERENCES `mesh_sessions`(`node_id`,`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usage_turns` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`ordinal` integer NOT NULL,
	`id` text,
	`started_at` text,
	`started_ms` real,
	`completed_at` text,
	`duration_ms` real,
	`model` text NOT NULL,
	`effort` text,
	`service_tier` text NOT NULL,
	`calls` integer DEFAULT 0 NOT NULL,
	`input_tokens` real DEFAULT 0 NOT NULL,
	`cached_input_tokens` real DEFAULT 0 NOT NULL,
	`output_tokens` real DEFAULT 0 NOT NULL,
	`reasoning_output_tokens` real DEFAULT 0 NOT NULL,
	`total_tokens` real DEFAULT 0 NOT NULL,
	`cache_write_input_tokens` real,
	PRIMARY KEY(`node_id`, `session_id`, `ordinal`),
	FOREIGN KEY (`node_id`,`session_id`) REFERENCES `mesh_sessions`(`node_id`,`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_turns_session_time` ON `usage_turns` (`node_id`,`session_id`,`started_ms`);--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `relational_version` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `title` text;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `cwd` text;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `started_at` text;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `content_hash` text;
--> statement-breakpoint
-- Relational ingestion: atomic compatibility with existing signed agents.
DROP TRIGGER IF EXISTS mesh_sessions_index_insert;
--> statement-breakpoint
DROP TRIGGER IF EXISTS mesh_sessions_index_update;
--> statement-breakpoint
CREATE TRIGGER mesh_sessions_relational_insert AFTER INSERT ON mesh_sessions
WHEN NEW.relational_version IN (0,2) OR json_type(NEW.snapshot_json,'$.calls')='array' OR json_type(NEW.snapshot_json,'$.turns')='array'
BEGIN
  DELETE FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.calls'),0);
  DELETE FROM usage_turns WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.turns'),0);
  DELETE FROM usage_session_models WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
  INSERT INTO usage_calls SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    json_extract(value, '$.timestamp'), round((julianday(json_extract(value, '$.timestamp')) - 2440587.5) * 86400000), json_extract(value, '$.turnId'), coalesce(json_extract(value, '$.model'), 'unknown'),
    json_extract(value, '$.effort'), coalesce(json_extract(value, '$.serviceTier'), 'default'), coalesce(json_extract(value, '$.usage.inputTokens'), 0), coalesce(json_extract(value, '$.usage.cachedInputTokens'), 0), coalesce(json_extract(value, '$.usage.outputTokens'), 0), coalesce(json_extract(value, '$.usage.reasoningOutputTokens'), 0), coalesce(json_extract(value, '$.usage.totalTokens'), 0), json_extract(value, '$.usage.cacheWriteInputTokens')
    FROM json_each(NEW.snapshot_json, '$.calls') WHERE true ON CONFLICT(node_id,session_id,ordinal) DO UPDATE SET timestamp=excluded.timestamp,timestamp_ms=excluded.timestamp_ms,turn_id=excluded.turn_id,model=excluded.model,effort=excluded.effort,service_tier=excluded.service_tier,input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,output_tokens=excluded.output_tokens,reasoning_output_tokens=excluded.reasoning_output_tokens,total_tokens=excluded.total_tokens,cache_write_input_tokens=excluded.cache_write_input_tokens
    WHERE (usage_calls.timestamp,usage_calls.timestamp_ms,usage_calls.turn_id,usage_calls.model,usage_calls.effort,usage_calls.service_tier,usage_calls.input_tokens,usage_calls.cached_input_tokens,usage_calls.output_tokens,usage_calls.reasoning_output_tokens,usage_calls.total_tokens,usage_calls.cache_write_input_tokens) IS NOT (excluded.timestamp,excluded.timestamp_ms,excluded.turn_id,excluded.model,excluded.effort,excluded.service_tier,excluded.input_tokens,excluded.cached_input_tokens,excluded.output_tokens,excluded.reasoning_output_tokens,excluded.total_tokens,excluded.cache_write_input_tokens);
  INSERT INTO usage_turns SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    json_extract(value, '$.id'), json_extract(value, '$.startedAt'), round((julianday(json_extract(value, '$.startedAt')) - 2440587.5) * 86400000), json_extract(value, '$.completedAt'), json_extract(value, '$.durationMs'),
    coalesce(json_extract(value, '$.model'), 'unknown'), json_extract(value, '$.effort'), coalesce(json_extract(value, '$.serviceTier'), 'default'),
    coalesce(json_extract(value, '$.calls'), 0), coalesce(json_extract(value, '$.usage.inputTokens'), 0), coalesce(json_extract(value, '$.usage.cachedInputTokens'), 0), coalesce(json_extract(value, '$.usage.outputTokens'), 0), coalesce(json_extract(value, '$.usage.reasoningOutputTokens'), 0), coalesce(json_extract(value, '$.usage.totalTokens'), 0), json_extract(value, '$.usage.cacheWriteInputTokens')
    FROM json_each(NEW.snapshot_json, '$.turns') WHERE true ON CONFLICT(node_id,session_id,ordinal) DO UPDATE SET id=excluded.id,started_at=excluded.started_at,started_ms=excluded.started_ms,completed_at=excluded.completed_at,duration_ms=excluded.duration_ms,model=excluded.model,effort=excluded.effort,service_tier=excluded.service_tier,calls=excluded.calls,input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,output_tokens=excluded.output_tokens,reasoning_output_tokens=excluded.reasoning_output_tokens,total_tokens=excluded.total_tokens,cache_write_input_tokens=excluded.cache_write_input_tokens
    WHERE (usage_turns.id,usage_turns.started_at,usage_turns.started_ms,usage_turns.completed_at,usage_turns.duration_ms,usage_turns.model,usage_turns.effort,usage_turns.service_tier,usage_turns.calls,usage_turns.input_tokens,usage_turns.cached_input_tokens,usage_turns.output_tokens,usage_turns.reasoning_output_tokens,usage_turns.total_tokens,usage_turns.cache_write_input_tokens) IS NOT (excluded.id,excluded.started_at,excluded.started_ms,excluded.completed_at,excluded.duration_ms,excluded.model,excluded.effort,excluded.service_tier,excluded.calls,excluded.input_tokens,excluded.cached_input_tokens,excluded.output_tokens,excluded.reasoning_output_tokens,excluded.total_tokens,excluded.cache_write_input_tokens);
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
END;
--> statement-breakpoint
CREATE TRIGGER mesh_sessions_relational_update AFTER UPDATE OF snapshot_json ON mesh_sessions
WHEN NEW.relational_version IN (0,2) OR json_type(NEW.snapshot_json,'$.calls')='array' OR json_type(NEW.snapshot_json,'$.turns')='array'
BEGIN
  DELETE FROM usage_calls WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.calls'),0);
  DELETE FROM usage_turns WHERE node_id=NEW.node_id AND session_id=NEW.session_id AND ordinal>=coalesce(json_array_length(NEW.snapshot_json,'$.turns'),0);
  DELETE FROM usage_session_models WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
  INSERT INTO usage_calls SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    json_extract(value, '$.timestamp'), round((julianday(json_extract(value, '$.timestamp')) - 2440587.5) * 86400000), json_extract(value, '$.turnId'), coalesce(json_extract(value, '$.model'), 'unknown'),
    json_extract(value, '$.effort'), coalesce(json_extract(value, '$.serviceTier'), 'default'), coalesce(json_extract(value, '$.usage.inputTokens'), 0), coalesce(json_extract(value, '$.usage.cachedInputTokens'), 0), coalesce(json_extract(value, '$.usage.outputTokens'), 0), coalesce(json_extract(value, '$.usage.reasoningOutputTokens'), 0), coalesce(json_extract(value, '$.usage.totalTokens'), 0), json_extract(value, '$.usage.cacheWriteInputTokens')
    FROM json_each(NEW.snapshot_json, '$.calls') WHERE true ON CONFLICT(node_id,session_id,ordinal) DO UPDATE SET timestamp=excluded.timestamp,timestamp_ms=excluded.timestamp_ms,turn_id=excluded.turn_id,model=excluded.model,effort=excluded.effort,service_tier=excluded.service_tier,input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,output_tokens=excluded.output_tokens,reasoning_output_tokens=excluded.reasoning_output_tokens,total_tokens=excluded.total_tokens,cache_write_input_tokens=excluded.cache_write_input_tokens
    WHERE (usage_calls.timestamp,usage_calls.timestamp_ms,usage_calls.turn_id,usage_calls.model,usage_calls.effort,usage_calls.service_tier,usage_calls.input_tokens,usage_calls.cached_input_tokens,usage_calls.output_tokens,usage_calls.reasoning_output_tokens,usage_calls.total_tokens,usage_calls.cache_write_input_tokens) IS NOT (excluded.timestamp,excluded.timestamp_ms,excluded.turn_id,excluded.model,excluded.effort,excluded.service_tier,excluded.input_tokens,excluded.cached_input_tokens,excluded.output_tokens,excluded.reasoning_output_tokens,excluded.total_tokens,excluded.cache_write_input_tokens);
  INSERT INTO usage_turns SELECT NEW.node_id, NEW.session_id, CAST(key AS INTEGER),
    json_extract(value, '$.id'), json_extract(value, '$.startedAt'), round((julianday(json_extract(value, '$.startedAt')) - 2440587.5) * 86400000), json_extract(value, '$.completedAt'), json_extract(value, '$.durationMs'),
    coalesce(json_extract(value, '$.model'), 'unknown'), json_extract(value, '$.effort'), coalesce(json_extract(value, '$.serviceTier'), 'default'),
    coalesce(json_extract(value, '$.calls'), 0), coalesce(json_extract(value, '$.usage.inputTokens'), 0), coalesce(json_extract(value, '$.usage.cachedInputTokens'), 0), coalesce(json_extract(value, '$.usage.outputTokens'), 0), coalesce(json_extract(value, '$.usage.reasoningOutputTokens'), 0), coalesce(json_extract(value, '$.usage.totalTokens'), 0), json_extract(value, '$.usage.cacheWriteInputTokens')
    FROM json_each(NEW.snapshot_json, '$.turns') WHERE true ON CONFLICT(node_id,session_id,ordinal) DO UPDATE SET id=excluded.id,started_at=excluded.started_at,started_ms=excluded.started_ms,completed_at=excluded.completed_at,duration_ms=excluded.duration_ms,model=excluded.model,effort=excluded.effort,service_tier=excluded.service_tier,calls=excluded.calls,input_tokens=excluded.input_tokens,cached_input_tokens=excluded.cached_input_tokens,output_tokens=excluded.output_tokens,reasoning_output_tokens=excluded.reasoning_output_tokens,total_tokens=excluded.total_tokens,cache_write_input_tokens=excluded.cache_write_input_tokens
    WHERE (usage_turns.id,usage_turns.started_at,usage_turns.started_ms,usage_turns.completed_at,usage_turns.duration_ms,usage_turns.model,usage_turns.effort,usage_turns.service_tier,usage_turns.calls,usage_turns.input_tokens,usage_turns.cached_input_tokens,usage_turns.output_tokens,usage_turns.reasoning_output_tokens,usage_turns.total_tokens,usage_turns.cache_write_input_tokens) IS NOT (excluded.id,excluded.started_at,excluded.started_ms,excluded.completed_at,excluded.duration_ms,excluded.model,excluded.effort,excluded.service_tier,excluded.calls,excluded.input_tokens,excluded.cached_input_tokens,excluded.output_tokens,excluded.reasoning_output_tokens,excluded.total_tokens,excluded.cache_write_input_tokens);
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
END;
