// Compare forecast calibration using a read-only fixture and fixed quota metadata.
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {createQuotaDetail} from '../public/quota-data.js';
import {readQuotaCalls,readQuotaCalibration,readQuotaSamples} from '../src/storage/relational-reader.mjs';

const metadata=JSON.parse(readFileSync(process.env.BENCH_METADATA || '.cache/page-performance/weekly-metadata.json','utf8'));
const {createQuotaDetail:beforeBuilder}=await import(pathToFileURL(path.resolve(process.env.BENCH_BEFORE || '.cache/page-performance/weekly-before/public/quota-data.js')).href);
const {readQuotaCalls:readBeforeCalls}=await import(pathToFileURL(path.resolve('.cache/page-performance/weekly-before/src/storage/relational-reader.mjs')).href);
const raw=new DatabaseSync(process.env.BENCH_DATABASE || '.cache/page-performance/fixture.sqlite',{readOnly:true});
try {
  raw.exec('BEGIN');
  const owner=raw.prepare('SELECT owner_id FROM mesh_nodes LIMIT 1').get().owner_id;
  const now=new Date(metadata.weeklyQuota?.observedAt || metadata.generatedAt);
  let metrics;
  const adapter={prepare(sql){const statement=raw.prepare(sql);return {bind(...values){return {
    first:async()=>{metrics.queries++;return statement.get(...values);},
    all:async()=>{metrics.queries++;const t=performance.now();const results=statement.all(...values);metrics.sqlMs+=performance.now()-t;metrics.bytes+=Buffer.byteLength(JSON.stringify(results));metrics.rows+=results.length;return {results};},
  };}};}};
  const clean=call=>({timestamp:call.timestamp,model:call.model,effort:call.effort,serviceTier:call.serviceTier,usage:call.usage});
  function near(actual,expected){
    if(typeof expected==='number') assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${actual} differs from ${expected}`);
    else if(expected && typeof expected==='object'){assert.deepEqual(Object.keys(actual),Object.keys(expected));for(const key of Object.keys(expected))near(actual[key],expected[key]);}
    else assert.equal(actual,expected);
  }
  const results={before:[],after:[]};
  let expected;
  for(let pass=0;pass<3;pass++) for(const mode of ['before','after']) {
    metrics={queries:0,sqlMs:0,bytes:0,rows:0};
    const detail=(mode==='before'?beforeBuilder:createQuotaDetail)(metadata,null,now);
    const t=performance.now();
    if(mode==='before') await readBeforeCalls(adapter,owner,new Date(detail.from).toISOString(),new Date(detail.to).toISOString(),(call,node)=>detail.add(clean(call),node));
    else {
      await readQuotaCalls(adapter,owner,new Date(detail.callsFrom).toISOString(),new Date(detail.sampleTo).toISOString(),(call,node)=>detail.addRecent(clean(call),node));
      await readQuotaCalibration(adapter,owner,detail.calibrationWindows,detail.calibrationNodeId,(call,node)=>detail.addCalibration(call,node));
      await readQuotaSamples(adapter,owner,detail.sampleFrom,detail.callsFrom-1,detail.sampleAnchor,detail.calibrationNodeId,(call,node)=>detail.addHistoricalSample(call,node));
    }
    const output=detail.finish();
    if(!expected) expected=output;
    assert.deepEqual(output.sessions,expected.sessions,'Selected-week events changed');
    near(output.quotaDetail,expected.quotaDetail);
    results[mode].push({ms:performance.now()-t,...metrics});
  }
  const median=(samples,key)=>samples.map(s=>s[key]).sort((a,b)=>a-b)[1];
  console.log(JSON.stringify({runtime:process.version,periods:metadata.weeklyQuotaHistory?.length,identicalForecastWithinFloatingPointTolerance:true,results:Object.fromEntries(Object.entries(results).map(([mode,samples])=>[mode,{medianMs:+median(samples,'ms').toFixed(2),sqlMs:+median(samples,'sqlMs').toFixed(2),queries:median(samples,'queries'),rows:median(samples,'rows'),bytes:median(samples,'bytes')}]))},null,2));
} finally {raw.close();}
