import { integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const enrollments = sqliteTable("mesh_enrollments", {
  codeHash: text("code_hash").primaryKey(),
  ownerId: text("owner_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  usedAt: text("used_at"),
  createdAt: text("created_at").notNull(),
});

export const nodes = sqliteTable("mesh_nodes", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  alias: text("alias").notNull(),
  publicKey: text("public_key").notNull(),
  fingerprint: text("fingerprint").notNull().unique(),
  enrolledAt: text("enrolled_at").notNull(),
  lastSeen: text("last_seen"),
  lastGeneratedAt: text("last_generated_at"),
  lastSequence: integer("last_sequence").notNull().default(0),
  lastPayloadHash: text("last_payload_hash"),
  revokedAt: text("revoked_at"),
  privacyJson: text("privacy_json").notNull(),
  quotaJson: text("quota_json"),
  analyzerVersion: integer("analyzer_version").notNull().default(0),
});

export const sessions = sqliteTable("mesh_sessions", {
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  updatedAt: text("updated_at"),
}, (table) => [primaryKey({ columns: [table.nodeId, table.sessionId] })]);
