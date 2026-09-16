import { requireViewer } from "../../../lib/auth";
import { json } from "../../../lib/mesh";
import { quotaMetadataForOwner } from "../../../lib/usage";
import { db } from "../../../lib/db";
import { createQuotaDetail } from "../../../public/dashboard/quota-data.js";
import { matchesQuotaEtag } from "../../../public/dashboard/quota-periods.js";

export async function GET(request: Request) {
  try {
    const owner = requireViewer(request).id;
    const parameters = new URL(request.url).searchParams;
    if ((parameters.get("source") || "centralized") !== "centralized") return json({ error: "Source invalide." }, 400);
    const metadata = await quotaMetadataForOwner(owner);
    const detail = createQuotaDetail(metadata, parameters.get("period"));
    const etag = `"${metadata.revision}:${detail.reset || "current"}"`;
    const headers = { ETag: etag, "Cache-Control": "private, no-cache", "Vary": "Cookie, OAI-Authenticated-User-Id" };
    if (matchesQuotaEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    if (parameters.get("detail") !== "1") return Response.json(metadata, { headers });
    // D1 extracts only relevant calls, in bounded pages. No titles, turns or full
    // session snapshots are materialized in the Worker's 128 MB memory budget.
    let nodeCursor = "";
    let sessionCursor = "";
    while (true) {
      const rows = await db().prepare(`SELECT s.node_id, s.session_id,
        (SELECT json_group_array(json(c.value)) FROM json_each(s.snapshot_json, '$.calls') c
          WHERE julianday(json_extract(c.value, '$.timestamp')) IS NULL
          OR julianday(json_extract(c.value, '$.timestamp')) BETWEEN julianday(?) AND julianday(?)) AS calls_json
        FROM mesh_sessions s JOIN mesh_nodes n ON n.id = s.node_id
        WHERE n.owner_id = ? AND n.revoked_at IS NULL AND (s.node_id, s.session_id) > (?, ?)
        ORDER BY s.node_id, s.session_id LIMIT 500`)
        .bind(new Date(detail.from).toISOString(), new Date(detail.to).toISOString(), owner, nodeCursor, sessionCursor)
        .all<{ node_id: string; session_id: string; calls_json: string }>();
      for (const row of rows.results || []) {
        for (const call of JSON.parse(row.calls_json)) {
          detail.add({ timestamp: call.timestamp, model: call.model, effort: call.effort, serviceTier: call.serviceTier, usage: call.usage }, row.node_id);
        }
        nodeCursor = row.node_id;
        sessionCursor = row.session_id;
      }
      if ((rows.results || []).length < 500) break;
    }
    const latest = await quotaMetadataForOwner(owner);
    if (latest.revision !== metadata.revision) return json({ error: "Les données ont changé pendant la lecture. Nouvelle tentative à la prochaine actualisation." }, 409);
    return Response.json(detail.finish(), { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    return json({ error: "Lecture du quota impossible." }, 500);
  }
}
