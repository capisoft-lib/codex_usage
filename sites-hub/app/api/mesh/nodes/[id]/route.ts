import { db } from "../../../../../lib/db";
import { requireViewer } from "../../../../../lib/auth";
import { json } from "../../../../../lib/mesh";

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const viewer = requireViewer(request);
    const { id } = await context.params;
    const result = await db().prepare("UPDATE mesh_nodes SET revoked_at = ? WHERE id = ? AND owner_id = ? AND revoked_at IS NULL").bind(new Date().toISOString(), id, viewer.id).run();
    if (!result.meta.changes) return json({ error: "Machine introuvable." }, 404);
    return json({ nodeId: id, revoked: true });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Révocation impossible." }, 500);
  }
}
