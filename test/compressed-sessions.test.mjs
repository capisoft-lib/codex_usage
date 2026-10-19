import assert from 'node:assert/strict';
import {mkdtemp, mkdir, writeFile, unlink, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import test from 'node:test';
import * as zlib from 'node:zlib';
import {analyzeCodexUsage, parseSessionFile, usageFingerprint} from '../src/analyzer.mjs';
import {UsageStore} from '../src/usage-store.mjs';

const supported = typeof zlib.zstdCompressSync === 'function';
const rows = [
  {timestamp:'2026-06-28T10:00:00Z',type:'session_meta',payload:{id:'archived',cwd:'C:/projet-é'}},
  {timestamp:'2026-06-28T10:00:01Z',type:'turn_context',payload:{turn_id:'turn',model:'gpt-test',effort:'high'}},
  {timestamp:'2026-06-28T10:00:02Z',type:'event_msg',payload:{type:'token_count',info:{last_token_usage:{input_tokens:123,cached_input_tokens:23,output_tokens:45,total_tokens:168}}}},
];
const content = Buffer.from(rows.map(JSON.stringify).join('\n')+'\n');
async function fixture(t) {
  const root=await mkdtemp(path.join(tmpdir(),'codex-zstd-'));
  t.after(()=>rm(root,{recursive:true}));
  await mkdir(path.join(root,'sessions'));await mkdir(path.join(root,'archived_sessions'));
  return root;
}

test('compressed archives preserve calls, tokens, Unicode and names; compression does not delete a session', {skip:!supported}, async t=>{
  const codexHome=await fixture(t), plain=path.join(codexHome,'sessions','rollout.jsonl');
  const archive=path.join(codexHome,'archived_sessions','rollout.jsonl.zst');
  await writeFile(plain,content);
  const first=await analyzeCodexUsage({codexHome}), fingerprint=await usageFingerprint({codexHome});
  await writeFile(archive,zlib.zstdCompressSync(content));
  assert.equal((await analyzeCodexUsage({codexHome})).sessions.length,1,'plain and compressed copies are deduplicated');
  await unlink(plain);
  assert.notEqual(await usageFingerprint({codexHome}),fingerprint);
  const next=await analyzeCodexUsage({codexHome,previousData:first});
  assert.equal(next.sessions.length,1);assert.equal(next.errors.length,0);
  const {filePath,...before}=first.sessions[0], {filePath:archivePath,...after}=next.sessions[0];
  delete before.fileSize;delete before.fileModifiedAtMs;delete after.fileSize;delete after.fileModifiedAtMs;
  assert.deepEqual(after,before);
  assert.equal(archivePath,archive);assert.equal(next.sessions[0].usage.totalTokens,168);
  assert.equal((await parseSessionFile(archive,new Map([['archived','Résumé historique']]))).title,'Résumé historique');
});

test('compressed filenames without session metadata retain the same fallback identity', {skip:!supported}, async t=>{
  const root=await fixture(t), file=path.join(root,'archived_sessions','fallback.jsonl.zst');
  await writeFile(file,zlib.zstdCompressSync(Buffer.from(JSON.stringify(rows[2])+'\n')));
  assert.equal((await parseSessionFile(file)).id,'fallback');
});

test('a damaged archive rejects the refresh and preserves persisted history without syncing removals', {skip:!supported}, async t=>{
  const codexHome=await fixture(t), archive=path.join(codexHome,'archived_sessions','rollout.jsonl.zst');
  await writeFile(archive,zlib.zstdCompressSync(content));
  let syncs=0;
  const store=new UsageStore({analyze:previousData=>analyzeCodexUsage({codexHome,previousData}),fingerprint:()=>usageFingerprint({codexHome}),onUpdated:()=>{syncs++},logger:{log(){},warn(){},error(){}}});
  t.after(()=>store.close());
  await store.refresh();assert.equal(syncs,1);
  await writeFile(archive,Buffer.from('corrupted zstd'));
  assert.equal((await store.refresh(true)).sessions.length,1);
  assert.equal(store.repository.loadUsage().data.sessions.length,1);
  assert.equal(syncs,1);assert.match(store.status().lastError,/archive Codex impossible/);
  await assert.rejects(parseSessionFile(path.join(codexHome,'absent.jsonl.zst')),/ENOENT/);
});
