import { requireViewer } from '../../../lib/auth';
import { json } from '../../../lib/mesh';
import { db } from '../../../lib/db';
import { quotaMetadataForOwner } from '../../../lib/usage';
import { createPageData } from '../../../public/dashboard/page-data.js';
import { matchesQuotaEtag } from '../../../public/dashboard/quota-periods.js';

export async function GET(request: Request) {
  try {
    const owner = requireViewer(request).id;
    const params = new URL(request.url).searchParams;
    if ((params.get('source') || 'centralized') !== 'centralized') return json({error:'Source invalide.'},400);
    const raw = params.get('query') || '';
    if (raw.length > 64000) return json({error:'Requête trop longue.'},400);
    const metadata = await quotaMetadataForOwner(owner);
    let builder;
    try { builder = createPageData(metadata, raw); } catch { return json({error:'Filtres invalides.'},400); }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(metadata.revision + raw));
    const etag = `"${Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')}"`;
    const headers = {ETag:etag, 'Cache-Control':'private, no-cache', Vary:'Cookie, OAI-Authenticated-User-Id'};
    if(matchesQuotaEtag(request.headers.get('if-none-match'),etag)) return new Response(null,{status:304,headers});
    const q = builder.query;
    const nodes = new Map(metadata.nodes.filter(n=>!n.revokedAt).map(n=>[n.id,n]));
    if(q.view !== 'settings') {
      let nodeCursor='', sessionCursor='';
      while(true) {
        // Extract the selected time range in SQLite, before transferring JSON
        // into the Worker. Pagination bounds peak memory during aggregation.
        const rows = await db().prepare(`SELECT s.node_id, s.session_id,
          json_set(s.snapshot_json, '$.calls', json((SELECT json_group_array(json(c.value)) FROM json_each(s.snapshot_json,'$.calls') c
            WHERE julianday(json_extract(c.value,'$.timestamp')) BETWEEN julianday(?) AND julianday(?))),
            '$.turns', json((SELECT json_group_array(json(t.value)) FROM json_each(s.snapshot_json,'$.turns') t
            WHERE julianday(json_extract(t.value,'$.startedAt')) BETWEEN julianday(?) AND julianday(?)))) AS snapshot_json
          FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id
          WHERE n.owner_id=? AND n.revoked_at IS NULL AND (s.node_id,s.session_id) > (?,?)
            AND (? = '' OR s.node_id || ':' || s.session_id = ?)
          ORDER BY s.node_id,s.session_id LIMIT 500`)
          .bind(Number.isFinite(q.start)?new Date(q.start).toISOString():'0001-01-01',Number.isFinite(q.end)?new Date(q.end).toISOString():'9999-12-31',
            Number.isFinite(q.start)?new Date(q.start).toISOString():'0001-01-01',Number.isFinite(q.end)?new Date(q.end).toISOString():'9999-12-31',owner,nodeCursor,sessionCursor,q.id||'',q.id||'')
          .all<{node_id:string;session_id:string;snapshot_json:string}>();
        for(const row of rows.results || []) {
          builder.add({...JSON.parse(row.snapshot_json),id:`${row.node_id}:${row.session_id}`,sourceSessionId:row.session_id,nodeId:row.node_id,nodeAlias:nodes.get(row.node_id)?.alias});
          nodeCursor=row.node_id;sessionCursor=row.session_id;
        }
        if((rows.results || []).length < 500) break;
      }
      if((await quotaMetadataForOwner(owner)).revision !== metadata.revision) return json({error:'Les données ont changé pendant la lecture. Réessayez.'},409);
    }
    return Response.json(builder.finish(),{headers});
  } catch(error) {
    if(error instanceof Response) return error;
    return json({error:'Lecture de la page impossible.'},500);
  }
}
