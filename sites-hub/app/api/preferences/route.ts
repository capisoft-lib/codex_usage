import { db } from "../../../lib/db";
import { requireViewer } from "../../../lib/auth";
import { json, readJsonBody } from "../../../lib/mesh";

export async function GET(request: Request) {
  try {
    const owner = requireViewer(request).id;
    const row = await db().prepare("SELECT theme FROM dashboard_preferences WHERE owner_id = ?").bind(owner).first<{ theme: string }>();
    return json({ theme: row?.theme || null });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Preferences unavailable" }, 500);
  }
}

export async function PUT(request: Request) {
  try {
    const owner = requireViewer(request).id;
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "Invalid origin" }, 403);
    if (!request.headers.get("content-type")?.startsWith("application/json")) return json({ error: "JSON required" }, 415);
    const { theme } = await readJsonBody<{ theme?: unknown }>(request, 1024);
    if (typeof theme !== "string" || !["green", "blue", "violet", "amber"].includes(theme)) return json({ error: "Invalid theme" }, 400);
    await db().prepare("INSERT INTO dashboard_preferences (owner_id, theme) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET theme = excluded.theme").bind(owner, theme).run();
    return json({ theme });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Preferences unavailable" }, 400);
  }
}
