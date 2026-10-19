import assert from 'node:assert/strict';
import test from 'node:test';
import {openSqlite} from '../src/storage/sqlite.mjs';
import {LocalRepository} from '../src/storage/local-repository.mjs';
import {readQuotaCalls,readQuotaCalibration,readQuotaSamples} from '../src/storage/relational-reader.mjs';
import {createQuotaDetail} from '../public/quota-data.js';

function near(actual,expected) {
  if(typeof expected==='number') assert.ok(Math.abs(actual-expected)<=1e-9*Math.max(1,Math.abs(expected)),`${actual} != ${expected}`);
  else if(expected && typeof expected==='object'){assert.deepEqual(Object.keys(actual),Object.keys(expected));for(const key of Object.keys(expected))near(actual[key],expected[key]);}
  else assert.equal(actual,expected);
}
const now=new Date('2026-09-16T06:37:00Z');
const current={startsAt:'2026-09-14T12:00:00Z',resetsAt:'2026-09-21T12:00:00Z',observedAt:'2026-09-16T06:30:00Z',usedPercent:30,planType:'pro',nodeId:'local',observations:[{observedAt:'2026-09-15T06:00:00Z',usedPercent:15},{observedAt:'2026-09-16T06:30:00Z',usedPercent:30}]};
const previous={...current,startsAt:'2026-09-07T12:00:00Z',resetsAt:current.startsAt,observedAt:current.startsAt,usedPercent:50,observations:[]};
for(const variation of ['normal','gap','invalid-date','invalid-usage','historical','other-plan']) {
  test(`SQL calibration and hourly history preserve the full forecast: ${variation}`,async()=>{
    const db=openSqlite(),repo=new LocalRepository(db);
    try {
      const call=time=>({timestamp:time,model:'gpt-5',serviceTier:'default',usage:{inputTokens:1000,cachedInputTokens:500,outputTokens:10}});
      const calls=Array.from({length:3400},(_,i)=>({...call(new Date(Date.parse('2026-08-20')+i*15*60000).toISOString()),serviceTier:i%3?'default':'priority'}));
      for(const time of [previous.startsAt,previous.observedAt,current.startsAt,current.observedAt]) calls.push(call(time),call(new Date(Date.parse(time)+1).toISOString()));
      if(variation==='gap') {
        calls.push({...call('2026-09-12T06:35:00Z'),model:'unrated-model'},call('2026-09-12T06:34:00Z'),call('2026-09-12T06:36:00Z'));
      }
      if(variation==='invalid-date') calls.push({...call('invalid'),model:'unrated-model'});
      if(variation==='invalid-usage') calls.push({...call('2026-09-10T12:00:00Z'),usage:{inputTokens:10,cachedInputTokens:11,outputTokens:5}});
      repo.saveUsage({generatedAt:now.toISOString(),sessions:[{id:'s',calls,turns:[]}]},'f',now.toISOString());
      for(const [node,owner,revoked] of [['other','someone',null],['revoked','local','2026-09-16']]) {
        db.raw.prepare('INSERT INTO mesh_nodes(id,owner_id,alias,public_key,fingerprint,enrolled_at,privacy_json,revoked_at) VALUES(?,?,?,?,?,?,?,?)').run(node,owner,node,'key',node,'2026-01-01','{}',revoked);
        db.raw.prepare('INSERT INTO mesh_sessions(node_id,session_id,snapshot_json,relational_version) VALUES(?,?,?,2)').run(node,'excluded',JSON.stringify({calls:[call(current.startsAt)]}));
      }
      const data={weeklyQuota:current,weeklyQuotaHistory:[current,{...previous,planType:variation==='other-plan'?'plus':'pro'}],sessions:[]};
      const reset=variation==='historical'?previous.resetsAt:null;
      const before=createQuotaDetail(data,reset,now),after=createQuotaDetail(data,reset,now);
      await readQuotaCalls(db,'local',new Date(before.from).toISOString(),new Date(before.to).toISOString(),(c,n)=>before.add(c,n));
      await readQuotaCalls(db,'local',new Date(after.callsFrom).toISOString(),new Date(after.sampleTo).toISOString(),(c,n)=>after.addRecent(c,n));
      await readQuotaCalibration(db,'local',after.calibrationWindows,after.calibrationNodeId,(c,n)=>after.addCalibration(c,n));
      await readQuotaSamples(db,'local',after.sampleFrom,after.callsFrom-1,after.sampleAnchor,after.calibrationNodeId,(c,n)=>after.addHistoricalSample(c,n));
      assert.deepEqual(after.finish().sessions,before.finish().sessions);
      near(after.finish().quotaDetail,before.finish().quotaDetail);
    } finally {db.close();}
  });
}
