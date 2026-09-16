import { db } from "./db";
import { readSessionSlices, migrateLegacySessions } from './session-reader';
import { normalizeQuotaPeriods } from "../public/dashboard/quota-periods.js";

type NodeRow = { id: string; alias: string; enrolled_at: string; last_seen: string | null; revoked_at: string | null; privacy_json: string; short_quota_json: string | null; quota_json: string | null; quota_history_json: string | null; analyzer_version: number; last_generated_at: string | null; last_payload_hash: string | null };
type SessionRow = { node_id: string; snapshot_json: string };

export async function quotaMetadataForOwner(ownerId: string, includeFirstSession = false) {
  const database = db();
  if (includeFirstSession) await migrateLegacySessions(database, ownerId);
  const nodeResult = await database.prepare("SELECT id, alias, enrolled_at, last_seen, revoked_at, privacy_json, short_quota_json, quota_json, quota_history_json, analyzer_version, last_generated_at, last_payload_hash FROM mesh_nodes WHERE owner_id = ? ORDER BY alias").bind(ownerId).all<NodeRow>();
  const nodes = nodeResult.results || [];
  const active = nodes.filter((node) => !node.revoked_at);
  const count = await database.prepare(`SELECT COUNT(*) AS total${includeFirstSession ? ", MIN(s.started_at) AS first_session_at" : ""} FROM mesh_sessions s JOIN mesh_nodes n ON n.id = s.node_id WHERE n.owner_id = ? AND n.revoked_at IS NULL`).bind(ownerId).first<{ total: number; first_session_at: string | null }>();
  const quotas = active.filter((node) => node.quota_json).map((node) => ({ ...JSON.parse(node.quota_json!), nodeId: node.id, nodeAlias: node.alias, receivedAt: node.last_seen }));
  quotas.sort((a, b) => String(b.observedAt || b.receivedAt).localeCompare(String(a.observedAt || a.receivedAt)));
  const shortQuotas = active.filter((node) => node.short_quota_json).map((node) => ({ ...JSON.parse(node.short_quota_json!), nodeId: node.id, nodeAlias: node.alias, receivedAt: node.last_seen }));
  shortQuotas.sort((a, b) => String(b.observedAt || b.receivedAt).localeCompare(String(a.observedAt || a.receivedAt)));
  const quotaHistory = active.flatMap((node) => node.quota_history_json
    ? (JSON.parse(node.quota_history_json) as (Record<string, unknown> & {observedAt?:string})[]).map((quota) => ({ ...quota, nodeId: node.id, nodeAlias: node.alias, receivedAt: node.last_seen }))
    : []);
  quotaHistory.sort((a, b) => String(b.observedAt || b.receivedAt).localeCompare(String(a.observedAt || a.receivedAt)));
  const uniqueQuotaHistory = normalizeQuotaPeriods({ weeklyQuotaHistory: quotaHistory, weeklyQuota: quotas[0] });
  const preferences = await database.prepare("SELECT theme FROM dashboard_preferences WHERE owner_id = ?").bind(ownerId).first<{ theme: string }>();
  const metadata = {
    theme: preferences?.theme || null,
    apiVersion: 1,
    analyzerVersion: Math.max(0, ...active.map((node) => node.analyzer_version || 0)),
    generatedAt: active.map((node) => node.last_generated_at || node.enrolled_at).sort().at(-1) || "1970-01-01T00:00:00.000Z",
    source: { mode: "mesh", sessionsAvailable: active.length > 0, archivedSessionsAvailable: false, sessionIndexAvailable: false },
    fiveHourQuota: shortQuotas[0] || null,
    weeklyQuota: uniqueQuotaHistory[0] || quotas[0] || null,
    weeklyQuotaHistory: uniqueQuotaHistory,
    nodes: nodes.map((node) => ({ id: node.id, alias: node.alias, enrolledAt: node.enrolled_at, lastSeen: node.last_seen, lastGeneratedAt: node.last_generated_at, revokedAt: node.revoked_at, privacy: JSON.parse(node.privacy_json) })),
    sessions: [],
    sessionCount: count?.total || 0,
    firstSessionAt: count?.first_session_at || null,
    quotaOnly: true,
    errorCount: 0,
  };
  // Signed reads update last_seen, but do not change usage. They must not invalidate it.
  const content = JSON.stringify([metadata,nodes.map(node=>node.last_payload_hash)], (key, value) => ["lastSeen", "receivedAt", "firstSessionAt"].includes(key) ? undefined : value);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  const revision = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  return { ...metadata, revision };
}

export async function aggregateUsageForOwner(ownerId: string) {
  const metadata = await quotaMetadataForOwner(ownerId);
  const byId = new Map(metadata.nodes.map((node) => [node.id, node]));
  const sessions: Record<string, unknown>[] = [];
  await readSessionSlices(db(),ownerId,'0001-01-01','9999-12-31',true,null,(row: SessionRow) => {
    const node = byId.get(row.node_id);
    if (!node) return;
    const session = JSON.parse(row.snapshot_json);
    sessions.push({ ...session, id: `${node.id}:${session.id}`, sourceSessionId: session.id, nodeId: node.id, nodeAlias: node.alias });
  },false,{allSessions:true});
  return { ...metadata, quotaOnly: false, sessions: sessions.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))) };
}
