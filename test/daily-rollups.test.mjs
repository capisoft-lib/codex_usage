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

test('last seven days cache finished days in the current month, keeping today and split days live', async () => {
  const db=openSqlite(), repo=new LocalRepository(db);
  const day=86400000, today=Math.floor(Date.now()/day)*day;
  const timestamp=ms=>new Date(ms).toISOString();
  try {
    const calls=Array.from({length:8},(_,i)=>({timestamp:timestamp(today-i*day),model:'gpt-5',usage:{inputTokens:100,outputTokens:10}}));
    calls.push({...calls[0],timestamp:timestamp(today-2*day+12*3600000)});
    repo.saveUsage({generatedAt:timestamp(today),sessions:[{id:'s',calls,turns:[]}]},'test',timestamp(today));
    const q={view:'overview',start:timestamp(today-6*day),end:timestamp(today+day-1),pricing:{schemaVersion:2,mode:'historical',asOf:'2026-10-19'},
      buckets:Array.from({length:7},(_,i)=>({start:timestamp(today-(6-i)*day),end:timestamp(today-(5-i)*day)}))};
    let batches=0;
    const adapter={...db,batch:async statements=>{batches++;assert.equal(statements.length,4);return db.batch(statements);}};
    const read=async(rollups,query=q)=>{
      const b=createPageData(repo.metadata(),query);
      await readSessionSlices(adapter,'local',query.start,query.end,false,null,row=>b.add({...JSON.parse(row.snapshot_json),id:row.session_id}),false,{aggregate:true,rollups,buckets:query.buckets});
      return b.finish();
    };
    assert.deepEqual(await read(true),await read(false));
    assert.equal(db.raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=0').get().n,6);
    assert.equal(batches,1);
    await read(true); assert.equal(batches,1,'Warm visits do not rebuild clean days');
    db.raw.exec('UPDATE usage_calls SET output_tokens=99 WHERE ordinal=2');
    assert.deepEqual(await read(true),await read(false));
    assert.equal(batches,2,'Only changed days are prepared again');
    const split={...q,buckets:[{start:timestamp(today-6*day+3600000),end:timestamp(today-2*day+12*3600000),inclusiveEnd:true}]};
    assert.deepEqual(await read(true,split),await read(false,split));
    db.raw.exec('UPDATE usage_calls SET output_tokens=88 WHERE ordinal=0');
    const normalize=value=>JSON.parse(JSON.stringify(value,(_key,v)=>typeof v==='number'?Number(v.toPrecision(12)):v));
    assert.deepEqual(normalize(await read(true)),normalize(await read(false)),'Today always reads current events (ignoring floating-point summation order)');
    assert.equal(batches,2);
  } finally {db.close();}
});
