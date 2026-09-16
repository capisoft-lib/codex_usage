import assert from 'node:assert/strict';
import test from 'node:test';
import { openSqlite } from '../src/storage/sqlite.mjs';
import { LocalRepository } from '../src/storage/local-repository.mjs';
import { readSessionSlices } from '../src/storage/relational-reader.mjs';

test('large history uses fewer round trips while preserving every session and event', async () => {
  const database = openSqlite();
  try {
    const repository = new LocalRepository(database);
    const sessions = Array.from({length:2050}, (_,i)=>({
      id:String(i).padStart(5,'0'), models:['gpt-5'],
      calls:[{timestamp:'2026-09-01T12:00:00Z',model:'gpt-5',usage:{inputTokens:100,outputTokens:10,totalTokens:110}}],turns:[],
    }));
    repository.saveUsage({sessions,generatedAt:'2026-09-16'},'test','2026-09-16');
    for (const aggregate of [false,true]) {
      let queries = 0, largestBatch = 0;
      const adapter = {prepare(sql) {
        const statement = database.prepare(sql);
        return {bind(...values) {
          const bound = statement.bind(...values);
          return {...bound, async all() {
            const result = await bound.all();
            if(sql.includes('AS snapshot_json')) { queries++; largestBatch=Math.max(largestBatch,result.results.length); }
            return result;
          }};
        }};
      }};
      const ids = new Set(); let count=0;
      await readSessionSlices(adapter,'local','1970-01-01','9999-12-31',false,null,row=>{
        assert.ok(!ids.has(row.session_id),'No duplicate across page boundaries');
        ids.add(row.session_id);
        count+=JSON.parse(row.snapshot_json).calls.reduce((n,c)=>n+(c._count ?? 1),0);
      },false,{aggregate});
      assert.equal(ids.size,2050);
      assert.equal(count,2050);
      assert.equal(queries,aggregate?3:17);
      assert.equal(largestBatch,aggregate?1024:128);
    }
  } finally { database.close(); }
});
