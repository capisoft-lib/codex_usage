import assert from 'node:assert/strict';
import test from 'node:test';
import {retryStorageRead,resilientDatabase,storageErrorResponse} from '../lib/storage-health.mjs';

test('temporary D1 reads recover with bounded retries and sanitized references',async()=>{
  let attempts=0;const logs=[];
  assert.equal(await retryStorageRead(async()=>{
    if (++attempts<3) throw new Error('D1_ERROR: internal error; reference = abc123 secret-title');
    return 42;
  },{sleep:async()=>{},logger:{error:(...args)=>logs.push(args)}}),42);
  assert.equal(attempts,3);assert.equal(logs.length,2);
  assert.ok(JSON.stringify(logs).includes('abc123'));assert.ok(!JSON.stringify(logs).includes('secret-title'));
  attempts=0;
  await assert.rejects(retryStorageRead(async()=>{attempts++;throw new Error('no such table');},
    {logger:{error(){}},sleep:async()=>{}}),/no such table/);
  assert.equal(attempts,1);
});

test('database batches unwrap statements and never replay ingestion writes',async()=>{
  let reads=0,writes=0;
  const raw={prepare:sql=>({sql,bind(){return this;},all:async()=>({results:[]})}),
    batch:async statements=>{
      assert.ok(statements.every(statement=>statement.sql));
      if(statements.every(statement=>statement.sql.startsWith('SELECT'))) {
        reads++;if(reads===1) throw new Error('D1_ERROR: internal error; reference = bounded');
        return [];
      }
      writes++;throw new Error('D1_ERROR: internal error; reference = once');
    }};
  const db=resilientDatabase(raw);
  await db.batch([db.prepare('SELECT 1').bind()]);assert.equal(reads,2);
  await assert.rejects(db.batch([db.prepare('UPDATE mesh_nodes SET last_sequence=2').bind()]),/internal error/);
  assert.equal(writes,1);
});

test('D1 failure responses have a retry code and request ID without raw data',async()=>{
  const result=storageErrorResponse(new Error('D1_ERROR: internal error; reference = safe private-data'),'/api/page');
  assert.equal(result.status,503);assert.equal(result.headers.get('retry-after'),'1');
  const data=await result.json();assert.equal(data.code,'storage_unavailable');assert.ok(data.requestId);
  assert.ok(!JSON.stringify(data).includes('private-data'));
});
