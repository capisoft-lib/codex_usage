import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from '../src/storage/sqlite.mjs';
import { LocalRepository } from '../src/storage/local-repository.mjs';
import { readSessionSlices } from '../src/storage/relational-reader.mjs';
import { createPageData } from '../public/page-data.js';

test('daily cache preserves prices, boundaries, filtering, late writes and deletion', async () => {
  const db = openSqlite(), repo = new LocalRepository(db);
  try {
    const calls = Array.from({length:300}, (_,i)=>({timestamp:new Date(Date.UTC(2025,7,10+i%3,0,i)).toISOString(), model:i%2?'gpt-5':'gpt-5-mini', effort:'high',serviceTier:i%3?'default':'priority',usage:{inputTokens:i%4?10000:300000,cachedInputTokens:4000,outputTokens:10,totalTokens:10010}}));
    calls.push({...calls[0],timestamp:'2025-08-10T22:00:00Z'}, {...calls[0],timestamp:'2025-08-10T22:00:00.001Z'});
    const turns = calls.slice(0,30).map((c,i)=>({id:String(i),startedAt:c.timestamp,model:c.model,durationMs:100,calls:1,usage:{}}));
    repo.saveUsage({generatedAt:'2026-09-16',sessions:[{id:'s',title:'Example',cwd:'/project',calls,turns}]},'f','2026-09-16');
    async function result(query,rollups=true) {
      const builder = createPageData(repo.metadata(),query);
      await readSessionSlices(db,'local',query.start,query.end,false,null,row=>builder.add({...JSON.parse(row.snapshot_json),id:row.session_id,nodeId:row.node_id}),false,{aggregate:true,rollups,buckets:query.buckets,model:query.model});
      return builder.finish();
    }
    const base = {view:'overview',start:'2025-01-01',end:'2026-12-31',pricing:{schemaVersion:2,mode:'historical',asOf:'2026-09-16'}};
    for(const view of ['overview','projects','conversations']) for(const mode of ['historical','current','custom']) {
      const q = {...base,view,model:view==='conversations'?'gpt-5':undefined,pricing:{schemaVersion:2,mode,asOf:'2026-09-16'},buckets:[{start:'2025-07-31T22:00:00Z',end:'2025-08-10T22:00:00Z',inclusiveEnd:true},{start:'2025-08-10T22:00:00Z',end:'2025-09-01T22:00:00Z'}]};
      assert.deepEqual(await result(q), await result(q,false));
    }
    assert.ok(db.raw.prepare('SELECT COUNT(*) n FROM usage_daily_rollups').get().n>0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=1').get().n,0);
    db.raw.prepare("UPDATE usage_calls SET output_tokens=output_tokens+50 WHERE ordinal=0").run();
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=1').get().n,1);
    assert.deepEqual(await result(base),await result(base,false));
    db.raw.prepare("UPDATE usage_calls SET timestamp_ms=?,timestamp=? WHERE ordinal=0").run(Date.parse('2025-08-12T12:00:00Z'),'2025-08-12T12:00:00Z');
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=1').get().n,2);
    assert.deepEqual(await result(base),await result(base,false));
    db.raw.prepare('DELETE FROM usage_calls WHERE ordinal=1').run();
    assert.deepEqual(await result(base),await result(base,false));
    db.raw.exec("DELETE FROM mesh_sessions");
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days').get().n,0);
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_daily_rollups').get().n,0);
  } finally { db.close(); }
});
