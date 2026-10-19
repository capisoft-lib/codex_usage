import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from '../src/storage/sqlite.mjs';
import { LocalRepository } from '../src/storage/local-repository.mjs';
import { readQuotaCalls, readSessionSlices } from '../src/storage/relational-reader.mjs';

test('quota event batches preserve exact events, invalid dates and owner isolation', async () => {
  const db = openSqlite(), repo = new LocalRepository(db);
  try {
    const call = {timestamp:'2026-10-18T00:00:00Z',model:'gpt-5',usage:{inputTokens:100,outputTokens:10}};
    repo.saveUsage({generatedAt:'2026-10-19',sessions:[{id:'long',calls:[
      ...Array.from({length:8200},(_,i)=>({...call,turnId:String(i)})),
      {...call,timestamp:'bad-date'}, {...call,timestamp:'2020-01-01'},
    ]}]},'test','2026-10-19');
    for (const [node,owner,revoked] of [['other','someone',null],['revoked','local','2026-10-19'],['z-local','local',null]]) {
      db.raw.prepare(`INSERT INTO mesh_nodes(id,owner_id,alias,public_key,fingerprint,enrolled_at,privacy_json,revoked_at) VALUES(?,?,?,?,?,?,?,?)`).run(node,owner,node,'key',node,'2026-01-01','{}',revoked);
      db.raw.prepare('INSERT INTO mesh_sessions(node_id,session_id,snapshot_json,relational_version) VALUES(?,?,?,2)').run(node,'excluded',JSON.stringify({calls:[call]}));
    }
    const expected=[];
    await readSessionSlices(db,'local','2026-10-01','2026-10-19',true,null,row=>{
      for(const c of JSON.parse(row.snapshot_json).calls) expected.push([row.node_id,c]);
    },true);
    const actual=[];
    await readQuotaCalls(db,'local','2026-10-01','2026-10-19',(c,node)=>actual.push([node,c]));
    assert.deepEqual(actual,expected);
    assert.equal(actual.length,8202);
    assert.equal(new Set(actual.map(([node,c])=>JSON.stringify([node,c.turnId]))).size,8202);
  } finally {db.close();}
});
