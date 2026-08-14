CREATE TABLE `mesh_enrollments` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `mesh_nodes` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_id` text NOT NULL,
	`alias` text NOT NULL,
	`public_key` text NOT NULL,
	`fingerprint` text NOT NULL,
	`enrolled_at` text NOT NULL,
	`last_seen` text,
	`last_generated_at` text,
	`last_sequence` integer DEFAULT 0 NOT NULL,
	`revoked_at` text,
	`privacy_json` text NOT NULL,
	`quota_json` text,
	`analyzer_version` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `mesh_nodes_fingerprint_unique` ON `mesh_nodes` (`fingerprint`);--> statement-breakpoint
CREATE TABLE `mesh_sessions` (
	`node_id` text NOT NULL,
	`session_id` text NOT NULL,
	`snapshot_json` text NOT NULL,
	`updated_at` text,
	PRIMARY KEY(`node_id`, `session_id`),
	FOREIGN KEY (`node_id`) REFERENCES `mesh_nodes`(`id`) ON UPDATE no action ON DELETE cascade
);
