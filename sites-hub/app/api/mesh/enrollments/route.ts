import { randomBytes } from "node:crypto";
import { db } from "../../../../lib/db";
import { requireViewer } from "../../../../lib/auth";
import { json, sha256 } from "../../../../lib/mesh";

export async function POST(request: Request) {
  try {
    const viewer = requireViewer(request);
    const raw = randomBytes(8).toString("hex").toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000).toISOString();
    await db().prepare("INSERT INTO mesh_enrollments (code_hash, owner_id, expires_at, used_at, created_at) VALUES (?, ?, ?, NULL, ?)")
      .bind(await sha256(code), viewer.id, expiresAt, now.toISOString()).run();
    return json({ code, expiresAt }, 201);
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Impossible de créer le code d’enrôlement." }, 500);
  }
}
