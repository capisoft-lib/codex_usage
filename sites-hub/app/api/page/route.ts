import { readSessionSlices } from '../../../lib/session-reader';
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
    let parsed;
    try { parsed=JSON.parse(raw); } catch { return json({error:'Filtres invalides.'},400); }
    const metadata = await quotaMetadataForOwner(owner, parsed?.view === 'overview' && Date.parse(parsed.start) === 0);
    let builder;
    try { builder = createPageData(metadata, raw); } catch { return json({error:'Filtres invalides.'},400); }
    const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(metadata.revision + raw));
    const etag = `"${Array.from(new Uint8Array(hash), b=>b.toString(16).padStart(2,'0')).join('')}"`;
    const headers = {ETag:etag, 'Cache-Control':'private, no-cache', Vary:'Cookie, OAI-Authenticated-User-Id'};
    if(matchesQuotaEtag(request.headers.get('if-none-match'),etag)) return new Response(null,{status:304,headers});
    const q = builder.query;
    const nodes = new Map(metadata.nodes.filter(n=>!n.revokedAt).map(n=>[n.id,n]));
    if(q.view !== 'settings') {
      await readSessionSlices(db(),owner,Number.isFinite(q.start)?new Date(q.start).toISOString():'0001-01-01',Number.isFinite(q.end)?new Date(q.end).toISOString():'9999-12-31',false,q.id || null,row=>{
        builder.add({...JSON.parse(row.snapshot_json),id:`${row.node_id}:${row.session_id}`,sourceSessionId:row.session_id,nodeId:row.node_id,nodeAlias:nodes.get(row.node_id)?.alias});
      });
      if(q.view === 'conversations') {
        const filters=await db().prepare("SELECT DISTINCT json_extract(s.snapshot_json,'$.cwd') AS cwd,json_extract(s.snapshot_json,'$.models') AS models_json FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id WHERE n.owner_id=? AND n.revoked_at IS NULL").bind(owner).all<{cwd:string;models_json:string|null}>();
        for(const row of filters.results || []) builder.add({cwd:row.cwd,models:JSON.parse(row.models_json || '[]'),calls:[],turns:[]});
      }
      if((await quotaMetadataForOwner(owner)).revision !== metadata.revision) return json({error:'Les données ont changé pendant la lecture. Réessayez.'},409);
    }
    return Response.json(builder.finish(),{headers});
  } catch(error) {
    if(error instanceof Response) return error;
    return json({error:'Lecture de la page impossible.'},500);
  }
}
