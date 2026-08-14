import { db } from "../../../../lib/db";
import { requireViewer } from "../../../../lib/auth";
import { json, validateReadPayload, verifyEnvelope, type SyncEnvelope } from "../../../../lib/mesh";
import { aggregateUsageForOwner } from "../../../../lib/usage";

export async function GET(request: Request) {
  try {
    return json(await aggregateUsageForOwner(requireViewer(request).id));
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Lecture impossible." }, 500);
  }
}

export async function POST(request: Request) {
  try {
    if (Number(request.headers.get("content-length") || 0) > 64 * 1024) return json({ error: "Charge utile trop volumineuse." }, 413);
    const envelope = await request.json() as SyncEnvelope;
    const database = db();
    const node = await database.prepare("SELECT owner_id, public_key, last_sequence, revoked_at FROM mesh_nodes WHERE id = ?")
      .bind(envelope.nodeId).first<{ owner_id: string; public_key: string; last_sequence: number; revoked_at: string | null }>();
    if (!node || node.revoked_at) return json({ error: "Machine inconnue ou révoquée." }, 401);
    await verifyEnvelope(envelope, node.public_key);
    if (envelope.sequence <= node.last_sequence) return json({ error: "Séquence déjà traitée." }, 409);
    validateReadPayload(envelope.payload);
    const receivedAt = new Date().toISOString();
    const update = await database.prepare("UPDATE mesh_nodes SET last_sequence = ?, last_payload_hash = ?, last_seen = ? WHERE id = ? AND last_sequence < ?")
      .bind(envelope.sequence, envelope.payloadHash, receivedAt, envelope.nodeId, envelope.sequence).run();
    if (!update.meta.changes) return json({ error: "Séquence déjà traitée." }, 409);
    return json(await aggregateUsageForOwner(node.owner_id));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Lecture refusée." }, 400);
  }
}
