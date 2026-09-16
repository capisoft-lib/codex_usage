ALTER TABLE `mesh_sessions` ADD `first_call_day` real;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `last_call_day` real;--> statement-breakpoint
ALTER TABLE `mesh_sessions` ADD `invalid_call_dates` integer DEFAULT -1 NOT NULL;--> statement-breakpoint
CREATE INDEX `mesh_sessions_node_call_range` ON `mesh_sessions` (`node_id`,`last_call_day`,`first_call_day`);
--> statement-breakpoint
CREATE TRIGGER mesh_sessions_index_insert AFTER INSERT ON mesh_sessions BEGIN
  UPDATE mesh_sessions SET (first_call_day,last_call_day,invalid_call_dates)=
    (SELECT MIN(julianday(json_extract(value,'$.timestamp'))),MAX(julianday(json_extract(value,'$.timestamp'))),
      COALESCE(SUM(julianday(json_extract(value,'$.timestamp')) IS NULL),0) FROM json_each(NEW.snapshot_json,'$.calls'))
    WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
END;
--> statement-breakpoint
CREATE TRIGGER mesh_sessions_index_update AFTER UPDATE OF snapshot_json ON mesh_sessions BEGIN
  UPDATE mesh_sessions SET (first_call_day,last_call_day,invalid_call_dates)=
    (SELECT MIN(julianday(json_extract(value,'$.timestamp'))),MAX(julianday(json_extract(value,'$.timestamp'))),
      COALESCE(SUM(julianday(json_extract(value,'$.timestamp')) IS NULL),0) FROM json_each(NEW.snapshot_json,'$.calls'))
    WHERE node_id=NEW.node_id AND session_id=NEW.session_id;
END;
