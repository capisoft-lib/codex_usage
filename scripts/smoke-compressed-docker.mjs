// Run inside the built image: node /verify-compressed.mjs.
// All source data and storage are disposable fixtures under /tmp.
import assert from 'node:assert/strict';
import {mkdir, writeFile, unlink, readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {zstdCompressSync} from 'node:zlib';

assert.equal(JSON.parse(await readFile('/app/package.json','utf8')).version,'1.6.1');
const root='/tmp/codex-compression-smoke';
await mkdir(root+'/sessions',{recursive:true});
await mkdir(root+'/archives');
const rows=[
  {timestamp:'2026-06-28T10:00:00Z',type:'session_meta',payload:{id:'compressed-history',cwd:'/project'}},
  {timestamp:'2026-06-28T10:00:01Z',type:'turn_context',payload:{turn_id:'t',model:'gpt-6-sol'}},
  {timestamp:'2026-06-28T10:00:02Z',type:'event_msg',payload:{type:'token_count',info:{last_token_usage:{input_tokens:123,output_tokens:45,total_tokens:168}}}},
];
const text=rows.map(JSON.stringify).join('\n')+'\n';
await writeFile(root+'/sessions/history.jsonl',text);
const server=spawn(process.execPath,['/app/server.mjs'],{env:{...process.env,
  PORT:'4317',CODEX_ACCOUNT_QUOTA_MODE:'off',CODEX_SESSIONS_PATH:root+'/sessions',
  CODEX_ARCHIVED_SESSIONS_PATH:root+'/archives',CODEX_SESSION_INDEX_PATH:root+'/index.jsonl',
  SNAPSHOT_PATH:root+'/usage.json',MESH_HUB_URL:'',MESH_AGENT_STATE_PATH:root+'/mesh.json'}});
let diagnostics='';server.stdout.on('data',chunk=>{diagnostics+=chunk});server.stderr.on('data',chunk=>{diagnostics+=chunk});
const closed=once(server,'close');
try {
  let ready=false;
  for(let i=0;i<100;i++) {try{const r=await fetch('http://127.0.0.1:4317/api/health');if((await r.json()).ready){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}
  assert.ok(ready,diagnostics);
  const usage=async()=>{const r=await fetch('http://127.0.0.1:4317/api/usage?refresh=1');assert.equal(r.status,200,diagnostics);return r.json();};
  const plain=await usage();assert.equal(plain.sessions.length,1);assert.equal(plain.sessions[0].usage.totalTokens,168);
  await writeFile(root+'/archives/history.jsonl.zst',zstdCompressSync(Buffer.from(text)));
  await unlink(root+'/sessions/history.jsonl');
  const compressed=await usage();assert.deepEqual(compressed.sessions,plain.sessions);
  await writeFile(root+'/archives/history.jsonl.zst',Buffer.from('damaged archive'));
  const preserved=await usage();assert.deepEqual(preserved.sessions,compressed.sessions);
  const health=await (await fetch('http://127.0.0.1:4317/api/health')).json();
  assert.match(health.lastError,/archive Codex impossible/);
  console.log(`PASS: ${process.arch} v1.6.1 HTTP collector preserves identity/tokens after Zstandard compression and retains history on archive failure.`);
} finally {server.kill('SIGTERM');await closed;}
