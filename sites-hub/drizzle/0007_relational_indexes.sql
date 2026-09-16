CREATE INDEX `mesh_nodes_owner` ON `mesh_nodes` (`owner_id`,`revoked_at`);--> statement-breakpoint
CREATE INDEX `mesh_sessions_pending_migration` ON `mesh_sessions` (`relational_version`,`node_id`);