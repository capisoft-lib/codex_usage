CREATE TABLE `usage_daily_rollups` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`day_ms` real NOT NULL,
	`kind` text NOT NULL,
	`ordinal` integer NOT NULL,
	`model` text NOT NULL,
	`value` text NOT NULL,
	PRIMARY KEY(`node_id`, `session_id`, `day_ms`, `kind`, `ordinal`),
	FOREIGN KEY (`node_id`,`session_id`,`day_ms`) REFERENCES `usage_rollup_days`(`node_id`,`session_id`,`day_ms`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usage_rollup_days` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`day_ms` real NOT NULL,
	`dirty` integer DEFAULT 1 NOT NULL,
	`signature` text DEFAULT '' NOT NULL,
	PRIMARY KEY(`node_id`, `session_id`, `day_ms`),
	FOREIGN KEY (`node_id`,`session_id`) REFERENCES `mesh_sessions`(`node_id`,`session_id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `usage_rollup_pending` ON `usage_rollup_days` (`dirty`,`node_id`,`day_ms`);
--> statement-breakpoint
INSERT INTO usage_rollup_days(node_id,session_id,day_ms)
    SELECT node_id,session_id,(timestamp_ms - ((timestamp_ms % 86400000 + 86400000) % 86400000)) FROM usage_calls WHERE timestamp_ms IS NOT NULL GROUP BY node_id,session_id,(timestamp_ms - ((timestamp_ms % 86400000 + 86400000) % 86400000))
    ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER usage_calls_rollup_insert AFTER INSERT ON usage_calls
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT NEW.node_id,NEW.session_id,(NEW.timestamp_ms - ((NEW.timestamp_ms % 86400000 + 86400000) % 86400000)),1
    WHERE NEW.timestamp_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=NEW.node_id AND session_id=NEW.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
--> statement-breakpoint
CREATE TRIGGER usage_calls_rollup_update AFTER UPDATE ON usage_calls
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT OLD.node_id,OLD.session_id,(OLD.timestamp_ms - ((OLD.timestamp_ms % 86400000 + 86400000) % 86400000)),1
    WHERE OLD.timestamp_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=OLD.node_id AND session_id=OLD.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1;
INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT NEW.node_id,NEW.session_id,(NEW.timestamp_ms - ((NEW.timestamp_ms % 86400000 + 86400000) % 86400000)),1
    WHERE NEW.timestamp_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=NEW.node_id AND session_id=NEW.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
--> statement-breakpoint
CREATE TRIGGER usage_calls_rollup_delete AFTER DELETE ON usage_calls
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT OLD.node_id,OLD.session_id,(OLD.timestamp_ms - ((OLD.timestamp_ms % 86400000 + 86400000) % 86400000)),1
    WHERE OLD.timestamp_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=OLD.node_id AND session_id=OLD.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
--> statement-breakpoint
INSERT INTO usage_rollup_days(node_id,session_id,day_ms)
    SELECT node_id,session_id,(started_ms - ((started_ms % 86400000 + 86400000) % 86400000)) FROM usage_turns WHERE started_ms IS NOT NULL GROUP BY node_id,session_id,(started_ms - ((started_ms % 86400000 + 86400000) % 86400000))
    ON CONFLICT DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER usage_turns_rollup_insert AFTER INSERT ON usage_turns
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT NEW.node_id,NEW.session_id,(NEW.started_ms - ((NEW.started_ms % 86400000 + 86400000) % 86400000)),1
    WHERE NEW.started_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=NEW.node_id AND session_id=NEW.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
--> statement-breakpoint
CREATE TRIGGER usage_turns_rollup_update AFTER UPDATE ON usage_turns
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT OLD.node_id,OLD.session_id,(OLD.started_ms - ((OLD.started_ms % 86400000 + 86400000) % 86400000)),1
    WHERE OLD.started_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=OLD.node_id AND session_id=OLD.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1;
INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT NEW.node_id,NEW.session_id,(NEW.started_ms - ((NEW.started_ms % 86400000 + 86400000) % 86400000)),1
    WHERE NEW.started_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=NEW.node_id AND session_id=NEW.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
--> statement-breakpoint
CREATE TRIGGER usage_turns_rollup_delete AFTER DELETE ON usage_turns
      BEGIN INSERT INTO usage_rollup_days(node_id,session_id,day_ms,dirty)
    SELECT OLD.node_id,OLD.session_id,(OLD.started_ms - ((OLD.started_ms % 86400000 + 86400000) % 86400000)),1
    WHERE OLD.started_ms IS NOT NULL AND EXISTS(SELECT 1 FROM mesh_sessions WHERE node_id=OLD.node_id AND session_id=OLD.session_id)
    ON CONFLICT(node_id,session_id,day_ms) DO UPDATE SET dirty=1; END;
