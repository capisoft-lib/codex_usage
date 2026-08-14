import { db } from "./db";

type NodeRow = { id: string; alias: string; enrolled_at: string; last_seen: string | null; revoked_at: string | null; privacy_json: string; quota_json: string | null; analyzer_version: number };
type SessionRow = { node_id: string; snapshot_json: string };

export async function aggregateUsageForOwner(ownerId: string) {
  const database = db();
  const nodeResult = await database.prepare("SELECT id, alias, enrolled_at, last_seen, revoked_at, privacy_json, quota_json, analyzer_version FROM mesh_nodes WHERE owner_id = ? ORDER BY alias").bind(ownerId).all<NodeRow>();
  const nodes = nodeResult.results || [];
  const active = nodes.filter((node) => !node.revoked_at);
  const sessionResult = await database.prepare("SELECT s.node_id, s.snapshot_json FROM mesh_sessions s JOIN mesh_nodes n ON n.id = s.node_id WHERE n.owner_id = ? AND n.revoked_at IS NULL").bind(ownerId).all<SessionRow>();
  const byId = new Map(active.map((node) => [node.id, node]));
  const sessions = (sessionResult.results || []).flatMap((row) => {
    const node = byId.get(row.node_id);
    if (!node) return [];
    const session = JSON.parse(row.snapshot_json) as Record<string, unknown>;
    return [{ ...session, id: `${node.id}:${session.id}`, sourceSessionId: session.id, nodeId: node.id, nodeAlias: node.alias }];
  });
  const quotas = active.filter((node) => node.quota_json).map((node) => ({ ...JSON.parse(node.quota_json!), nodeId: node.id, nodeAlias: node.alias, receivedAt: node.last_seen }));
  quotas.sort((a, b) => String(b.observedAt || b.receivedAt).localeCompare(String(a.observedAt || a.receivedAt)));
  return {
    apiVersion: 1,
    analyzerVersion: Math.max(0, ...active.map((node) => node.analyzer_version || 0)),
    generatedAt: new Date().toISOString(),
    source: { mode: "mesh", sessionsAvailable: active.length > 0, archivedSessionsAvailable: false, sessionIndexAvailable: false },
    weeklyQuota: quotas[0] || null,
    nodes: nodes.map((node) => ({ id: node.id, alias: node.alias, enrolledAt: node.enrolled_at, lastSeen: node.last_seen, revokedAt: node.revoked_at, privacy: JSON.parse(node.privacy_json) })),
    sessions: sessions.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
    errorCount: 0,
  };
}
