import { randomBytes } from "node:crypto";
import { db } from "../../../../lib/db";
import { requireViewer } from "../../../../lib/auth";
import { json, sha256 } from "../../../../lib/mesh";
import { publicMeshIngressUrl } from "../../../../lib/mesh-config";

export async function POST(request: Request) {
  try {
    const viewer = requireViewer(request);
    const hubUrl = publicMeshIngressUrl();
    const raw = Array.from(randomBytes(16), value => value.toString(16).padStart(2,'0')).join('').toUpperCase();
    const code = raw.match(/.{4}/g)!.join("-");
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    await db().prepare("INSERT INTO mesh_enrollments (code_hash, owner_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)")
      .bind(await sha256(code), viewer.id, expiresAt, now.toISOString()).run();
    return json({ code, expiresAt, hubUrl }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Impossible de créer le code d’enrôlement." }, 500);
  }
}
