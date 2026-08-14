import { db } from "../../../../lib/db";
import { json, validatePayload, verifyEnvelope, type SyncEnvelope } from "../../../../lib/mesh";

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 8 * 1024 * 1024) return json({ error: "Charge utile trop volumineuse." }, 413);
    const envelope = await request.json() as SyncEnvelope;
    const database = db();
    const node = await database.prepare("SELECT public_key, last_sequence, revoked_at FROM mesh_nodes WHERE id = ?").bind(envelope.nodeId).first<{ public_key: string; last_sequence: number; revoked_at: string | null }>();
    if (!node || node.revoked_at) return json({ error: "Machine inconnue ou révoquée." }, 401);
    await verifyEnvelope(envelope, node.public_key);
    if (envelope.sequence <= node.last_sequence) return json({ error: "Séquence déjà traitée." }, 409);
    validatePayload(envelope.payload);
    const payload = envelope.payload;
    const receivedAt = new Date().toISOString();
    const statements = [database.prepare("UPDATE mesh_nodes SET last_sequence = ?, last_payload_hash = ?, last_seen = ?, last_generated_at = ?, privacy_json = ?, quota_json = ?, quota_history_json = ?, analyzer_version = ? WHERE id = ? AND last_sequence < ?")
      .bind(envelope.sequence, envelope.payloadHash, receivedAt, String(payload.generatedAt), JSON.stringify(payload.privacy), payload.quota == null ? null : JSON.stringify(payload.quota), payload.quotaHistory == null ? null : JSON.stringify(payload.quotaHistory), Number(payload.analyzerVersion) || 0, envelope.nodeId, envelope.sequence)];
    for (const id of payload.removals) {
      statements.push(database.prepare("DELETE FROM mesh_sessions WHERE node_id = ? AND session_id = ? AND EXISTS (SELECT 1 FROM mesh_nodes WHERE id = ? AND last_sequence = ? AND last_payload_hash = ?)").bind(envelope.nodeId, id, envelope.nodeId, envelope.sequence, envelope.payloadHash));
    }
    for (const session of payload.upserts) {
      statements.push(database.prepare("INSERT INTO mesh_sessions (node_id, session_id, snapshot_json, updated_at) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM mesh_nodes WHERE id = ? AND last_sequence = ? AND last_payload_hash = ?) ON CONFLICT(node_id, session_id) DO UPDATE SET snapshot_json = excluded.snapshot_json, updated_at = excluded.updated_at")
        .bind(envelope.nodeId, String(session.id), JSON.stringify(session), String(session.updatedAt || payload.generatedAt), envelope.nodeId, envelope.sequence, envelope.payloadHash));
    }
    const results = await database.batch(statements);
    if (!results[0].meta.changes) return json({ error: "Séquence déjà traitée." }, 409);
    return json({ accepted: true, sequence: envelope.sequence });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Ingestion refusée." }, 400);
  }
}
