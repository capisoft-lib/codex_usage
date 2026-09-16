import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import { openSqlite } from '../src/storage/sqlite.mjs';
import { LocalRepository } from '../src/storage/local-repository.mjs';
import { readSessionSlices } from '../src/storage/relational-reader.mjs';
import { createPageData } from '../public/page-data.js';
const db=openSqlite(), repo=new LocalRepository(db);
try {
  const sessions=Array.from({length:200},(_,s)=>({id:`s${s}`,cwd:`/project/${s%10}`,calls:Array.from({length:1000},(_,i)=>({timestamp:new Date(Date.UTC(2025,s%12,10,0,i)).toISOString(),model:'gpt-5',effort:'high',serviceTier:'default',usage:{inputTokens:10000,cachedInputTokens:8000,outputTokens:100,totalTokens:10100}})),turns:[]}));
  repo.saveUsage({sessions,generatedAt:'2026-09-16'},'benchmark','2026-09-16');
  const query={view:'overview',start:'2025-01-01',end:'2026-09-16',pricing:{schemaVersion:2,mode:'historical',asOf:'2026-09-16'},buckets:Array.from({length:12},(_,m)=>({start:new Date(Date.UTC(2025,m,1)).toISOString(),end:new Date(Date.UTC(2025,m+1,1)).toISOString()}))};
  const execute=async(rollups,prepareOnly=false)=>{
    const builder=createPageData(repo.metadata(),query);
    await readSessionSlices(db,'local',query.start,query.end,false,null,row=>builder.add({...JSON.parse(row.snapshot_json),id:row.session_id,nodeId:row.node_id}),false,{aggregate:true,rollups,prepareOnly,buckets:query.buckets});
    return builder.finish();
  };
  const warmStart=performance.now();
  while(db.raw.prepare('SELECT 1 FROM usage_rollup_days WHERE dirty=1 LIMIT 1').get()) await execute(true,true);
  const preparationMs=performance.now()-warmStart;
  const samples={raw:[],rollups:[]}; let expected;
  for(let i=0;i<5;i++) for(const mode of ['raw','rollups']) {
    const start=performance.now(); const result=await execute(mode==='rollups'); samples[mode].push(performance.now()-start);
    if(!expected) expected=result; else assert.deepEqual(result,expected);
  }
  const median=xs=>xs.sort((a,b)=>a-b)[2]; const rawMs=median(samples.raw),rollupMs=median(samples.rollups);
  console.log(JSON.stringify({sessions:200,calls:200000,preparationMs,rawMs,rollupMs,speedup:rawMs/rollupMs,rollupRows:db.raw.prepare('SELECT COUNT(*) n FROM usage_daily_rollups').get().n},null,2));
} finally {db.close();}
