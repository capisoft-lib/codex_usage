import { foreignKey, index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
  shortQuotaJson: text("short_quota_json"),
  quotaJson: text("quota_json"),
  quotaHistoryJson: text("quota_history_json"),
  analyzerVersion: integer("analyzer_version").notNull().default(0),
}, table => [index('mesh_nodes_owner').on(table.ownerId, table.revokedAt)]);

export const sessions = sqliteTable("mesh_sessions", {
  nodeId: text("node_id").notNull().references(() => nodes.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  snapshotJson: text("snapshot_json").notNull(),
  updatedAt: text("updated_at"),
  firstCallDay: real("first_call_day"),
  lastCallDay: real("last_call_day"),
  invalidCallDates: integer("invalid_call_dates").notNull().default(-1),
  relationalVersion: integer("relational_version").notNull().default(0),
  title: text("title"),
  cwd: text("cwd"),
  startedAt: text("started_at"),
  contentHash: text("content_hash"),
}, (table) => [primaryKey({ columns: [table.nodeId, table.sessionId] }), index("mesh_sessions_node_call_range").on(table.nodeId, table.lastCallDay, table.firstCallDay), index('mesh_sessions_pending_migration').on(table.relationalVersion,table.nodeId)]);

// Shared by D1 and the embedded SQLite runtime. Ordinals preserve repeated calls
// (a timestamp or turn ID is not a unique event identifier).
const counters = () => ({
  inputTokens: real("input_tokens").notNull().default(0),
  cachedInputTokens: real("cached_input_tokens").notNull().default(0),
  outputTokens: real("output_tokens").notNull().default(0),
  reasoningOutputTokens: real("reasoning_output_tokens").notNull().default(0),
  totalTokens: real("total_tokens").notNull().default(0),
  cacheWriteInputTokens: real("cache_write_input_tokens"),
});

export const calls = sqliteTable("usage_calls", {
  nodeId: text("node_id").notNull(), sessionId: text("session_id").notNull(),
  ordinal: integer("ordinal").notNull(), timestamp: text("timestamp"),
  timestampMs: real("timestamp_ms"), turnId: text("turn_id"),
  model: text("model").notNull(), effort: text("effort"),
  serviceTier: text("service_tier").notNull(), ...counters(),
}, table => [
  primaryKey({ columns: [table.nodeId, table.sessionId, table.ordinal] }),
  foreignKey({ columns: [table.nodeId, table.sessionId], foreignColumns: [sessions.nodeId, sessions.sessionId] }).onDelete("cascade"),
  index("usage_calls_node_time").on(table.nodeId, table.timestampMs, table.sessionId),
  index("usage_calls_session_time").on(table.nodeId, table.sessionId, table.timestampMs),
]);

export const turns = sqliteTable("usage_turns", {
  nodeId: text("node_id").notNull(), sessionId: text("session_id").notNull(),
  ordinal: integer("ordinal").notNull(), id: text("id"),
  startedAt: text("started_at"), startedMs: real("started_ms"),
  completedAt: text("completed_at"), durationMs: real("duration_ms"),
  model: text("model").notNull(), effort: text("effort"),
  serviceTier: text("service_tier").notNull(), calls: integer("calls").notNull().default(0),
  ...counters(),
}, table => [
  primaryKey({ columns: [table.nodeId, table.sessionId, table.ordinal] }),
  foreignKey({ columns: [table.nodeId, table.sessionId], foreignColumns: [sessions.nodeId, sessions.sessionId] }).onDelete("cascade"),
  index("usage_turns_session_time").on(table.nodeId, table.sessionId, table.startedMs),
]);

export const sessionModels = sqliteTable("usage_session_models", {
  nodeId: text("node_id").notNull(), sessionId: text("session_id").notNull(), model: text("model").notNull(),
}, table => [
  primaryKey({ columns: [table.nodeId, table.sessionId, table.model] }),
  foreignKey({ columns: [table.nodeId, table.sessionId], foreignColumns: [sessions.nodeId, sessions.sessionId] }).onDelete("cascade"),
]);

export const preferences = sqliteTable("dashboard_preferences", {
  ownerId: text("owner_id").primaryKey(),
  theme: text("theme").notNull(),
});

export const rollupDays = sqliteTable('usage_rollup_days', {
  nodeId: text('node_id').notNull(), sessionId: text('session_id').notNull(), dayMs: real('day_ms').notNull(),
  dirty: integer('dirty').notNull().default(1), signature: text('signature').notNull().default(''),
}, table => [
  primaryKey({ columns: [table.nodeId, table.sessionId, table.dayMs] }),
  foreignKey({ columns: [table.nodeId, table.sessionId], foreignColumns: [sessions.nodeId, sessions.sessionId] }).onDelete('cascade'),
  index('usage_rollup_pending').on(table.dirty, table.nodeId, table.dayMs),
]);

export const dailyRollups = sqliteTable('usage_daily_rollups', {
  nodeId: text('node_id').notNull(), sessionId: text('session_id').notNull(), dayMs: real('day_ms').notNull(),
  kind: text('kind').notNull(), ordinal: integer('ordinal').notNull(), model: text('model').notNull(), value: text('value').notNull(),
}, table => [
  primaryKey({ columns: [table.nodeId, table.sessionId, table.dayMs, table.kind, table.ordinal] }),
  foreignKey({ columns: [table.nodeId, table.sessionId, table.dayMs], foreignColumns: [rollupDays.nodeId, rollupDays.sessionId, rollupDays.dayMs] }).onDelete('cascade'),
]);
