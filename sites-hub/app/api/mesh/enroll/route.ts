import { db } from "../../../../lib/db";
import { json, normalizeAlias, sha256, sha256Bytes } from "../../../../lib/mesh";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { code?: string; alias?: string; publicKey?: string };
    if (!body.code || !body.publicKey || body.publicKey.length > 4096) return json({ error: "Demande invalide." }, 400);
    const alias = normalizeAlias(body.alias);
    const database = db();
    const codeHash = await sha256(body.code.trim().toUpperCase());
    const enrollment = await database.prepare("SELECT owner_id, expires_at, used_at FROM mesh_enrollments WHERE code_hash = ?").bind(codeHash).first<{ owner_id: string; expires_at: string; used_at: string | null }>();
    if (!enrollment || enrollment.used_at || Date.parse(enrollment.expires_at) < Date.now()) return json({ error: "Code invalide ou expiré." }, 401);
    const keyBody = body.publicKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    const fingerprint = await sha256Bytes(Uint8Array.from(atob(keyBody), (character) => character.charCodeAt(0)));
    const nodeId = `node_${fingerprint.slice(0, 20)}`;
    const now = new Date().toISOString();
    const results = await database.batch([
      database.prepare("INSERT INTO mesh_nodes (id, owner_id, alias, public_key, fingerprint, enrolled_at, last_sequence, privacy_json, analyzer_version) SELECT ?, owner_id, ?, ?, ?, ?, 0, ?, 0 FROM mesh_enrollments WHERE code_hash = ? AND used_at IS NULL AND expires_at >= ?").bind(nodeId, alias, body.publicKey, fingerprint, now, JSON.stringify({ projectMode: "hash", includeTitles: false }), codeHash, now),
      database.prepare("UPDATE mesh_enrollments SET used_at = ? WHERE code_hash = ? AND used_at IS NULL").bind(now, codeHash),
    ]);
    if (!results[0].meta.changes) return json({ error: "Code déjà utilisé." }, 409);
    return json({ nodeId, alias }, 201);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Enrôlement impossible." }, 400);
  }
}
