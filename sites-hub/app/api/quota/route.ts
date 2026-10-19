import { readQuotaCalls, readQuotaCalibration, readQuotaSamples, StorageMigrationPending } from '../../../lib/session-reader';
import { requireViewer } from "../../../lib/auth";
import { json } from "../../../lib/mesh";
import { quotaMetadataForOwner } from "../../../lib/usage";
import { db } from "../../../lib/db";
import { createQuotaDetail } from "../../../public/dashboard/quota-data.js";
import { matchesQuotaEtag } from "../../../public/dashboard/quota-periods.js";

export async function GET(request: Request) {
  try {
    const started = performance.now();
    const owner = requireViewer(request).id;
    const parameters = new URL(request.url).searchParams;
    if ((parameters.get("source") || "centralized") !== "centralized") return json({ error: "Source invalide." }, 400);
    const metadata = await quotaMetadataForOwner(owner);
    const detail = createQuotaDetail(metadata, parameters.get("period"));
    const etag = `"${metadata.revision}:${detail.reset || "current"}"`;
    const metadataDone = performance.now();
    const headers: Record<string,string> = { ETag: etag, "Cache-Control": "private, no-cache", "Vary": "Cookie, OAI-Authenticated-User-Id" };
    if (matchesQuotaEtag(request.headers.get("if-none-match"), etag)) return new Response(null, { status: 304, headers });
    if (parameters.get("detail") !== "1") return Response.json(metadata, { headers });
    // D1 extracts only relevant calls, in bounded pages. No titles, turns or full
    // session snapshots are materialized in the Worker's 128 MB memory budget.
    await readQuotaCalls(db(),owner,new Date(detail.callsFrom).toISOString(),new Date(detail.sampleTo).toISOString(),(call: Record<string, unknown>,nodeId: string)=>{
      detail.addRecent({timestamp:call.timestamp,model:call.model,effort:call.effort,serviceTier:call.serviceTier,usage:call.usage},nodeId);
    });
    const callsDone = performance.now();
    await Promise.all([
      readQuotaCalibration(db(),owner,detail.calibrationWindows,detail.calibrationNodeId,(call: Record<string, unknown>,nodeId: string)=>detail.addCalibration(call,nodeId)),
      readQuotaSamples(db(),owner,detail.sampleFrom,detail.callsFrom-1,detail.sampleAnchor,detail.calibrationNodeId,(call: Record<string, unknown>,nodeId: string)=>detail.addHistoricalSample(call,nodeId)),
    ]);
    const historyDone = performance.now();
    const latest = await quotaMetadataForOwner(owner);
    const revisionDone = performance.now();
    const output = detail.finish();
    headers['Server-Timing'] = `metadata;dur=${(metadataDone-started).toFixed(1)},calls;dur=${(callsDone-metadataDone).toFixed(1)},history;dur=${(historyDone-callsDone).toFixed(1)},revision;dur=${(revisionDone-historyDone).toFixed(1)},forecast;dur=${(performance.now()-revisionDone).toFixed(1)}`;
    if (latest.revision !== metadata.revision) {
      // Completed forecasts remain useful during frequent agent synchronization.
      // Do not label a multi-batch read as an exact revision or retain its ETag.
      return Response.json({...output, revision:null}, {headers: {'Cache-Control':'private, no-store', Vary:headers.Vary,'Server-Timing':headers['Server-Timing']}});
    }
    return Response.json(output, { headers });
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof StorageMigrationPending) return json({error:error.message,code:error.code},503);
    return json({ error: "Lecture du quota impossible." }, 500);
  }
}
