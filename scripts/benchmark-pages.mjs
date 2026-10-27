// Repeatable server-side page measurements. Optional real history is opened read-only.
// BENCH_SOURCE_ROOT selects a preserved before/after source tree; no production writes.
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { performance } from 'node:perf_hooks';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { openSqlite } from '../src/storage/sqlite.mjs';
import { LocalRepository } from '../src/storage/local-repository.mjs';

const source = path.resolve(process.env.BENCH_SOURCE_ROOT || '.');
const moduleAt = name => import(pathToFileURL(path.join(source, name)).href);
const { readSessionSlices, readQuotaCalls, readQuotaCalibration, readQuotaSamples } = await moduleAt('src/storage/relational-reader.mjs');
const { createPageData } = await moduleAt('public/page-data.js');
const { createQuotaDetail } = await moduleAt('public/quota-data.js');
const database = process.env.BENCH_DATABASE
  ? { raw: new DatabaseSync(path.resolve(process.env.BENCH_DATABASE), { readOnly: true }) }
  : openSqlite();
const raw = database.raw;
try {
  if (!process.env.BENCH_DATABASE) {
    const repository = new LocalRepository(database);
    const count = Number(process.env.BENCH_SESSIONS || 4096);
    const sessions = Array.from({ length: count }, (_, s) => ({
      id: String(s).padStart(6, '0'), title: `Conversation ${s}`, cwd: `/project/${s % 24}`,
      models: ['gpt-5'], startedAt: '2026-08-01T00:00:00Z', turns: [],
      calls: Array.from({ length: 64 }, (_, i) => ({
        timestamp: new Date(Date.UTC(2026, 7, 1 + s % 70, 0, i)).toISOString(),
        model: 'gpt-5', effort: s % 2 ? 'high' : 'low', serviceTier: i % 3 ? 'default' : 'priority',
        usage: { inputTokens: 10000 + i, cachedInputTokens: 8000, outputTokens: 100, totalTokens: 10100 + i },
      })),
    }));
    repository.saveUsage({ sessions, generatedAt: '2026-10-19' }, 'benchmark', '2026-10-19');
  }
  raw.exec('BEGIN');
  const owner = raw.prepare('SELECT owner_id FROM mesh_nodes LIMIT 1').get().owner_id;
  const stats = raw.prepare(`SELECT COUNT(*) calls, MIN(timestamp_ms) first, MAX(timestamp_ms) last FROM usage_calls`).get();
  const now = new Date(stats.last + 3600000);
  const metadata = { sessions: [], generatedAt: now.toISOString(), weeklyQuota: {
    startsAt: new Date(stats.last - 6 * 86400000).toISOString(),
    resetsAt: new Date(stats.last + 86400000).toISOString(), observedAt: now.toISOString(), usedPercent: 40,
  }};
  const pricing = { schemaVersion: 2, mode: 'historical', asOf: '2026-10-19' };
  let metrics;
  const adapter = { ...(process.env.BENCH_ROLLUPS && !process.env.BENCH_DATABASE ? {batch:async statements=>{
    raw.exec('SAVEPOINT benchmark_cache');
    try { const results=statements.map(s=>s.execute()); raw.exec('RELEASE benchmark_cache'); return results; }
    catch(error) { raw.exec('ROLLBACK TO benchmark_cache'); raw.exec('RELEASE benchmark_cache'); throw error; }
  }} : {}), prepare(sql) {
    const statement = raw.prepare(sql);
    return { bind(...values) { return {
      first: async () => { metrics.queries++; return statement.get(...values); },
      execute: () => ({meta:statement.run(...values)}),
      all: async () => {
        metrics.queries++;
        const start = performance.now();
        const results = statement.all(...values);
        metrics.sqlMs += performance.now() - start;
        metrics.rows += results.length;
        metrics.bytes += Buffer.byteLength(JSON.stringify(results));
        return { results };
      },
    }; } };
  }};
  const scenarios = [
    { name: 'overview-all', view: 'overview', start: '1970-01-01' },
    { name: 'projects-all', view: 'projects', start: '1970-01-01' },
    { name: 'conversations-all', view: 'conversations', start: '1970-01-01' },
    { name: 'overview-week', view: 'overview', start: metadata.weeklyQuota.startsAt },
    { name: 'quota-detail-history', quota: true },
  ];
  const results = [];
  for (const scenario of scenarios.filter(s=>!process.env.BENCH_SCENARIOS || process.env.BENCH_SCENARIOS.split(',').includes(s.name))) {
    const samples = [];
    let expected;
    let preparationMs = 0;
    if (adapter.batch && !scenario.quota) {
      metrics={queries:0,sqlMs:0,rows:0,bytes:0};
      const begin=performance.now();
      for (;;) {
        const pending=raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=1').get().n;
        await readSessionSlices(adapter,owner,scenario.start,now.toISOString(),false,null,()=>{},false,{aggregate:true,prepareOnly:true});
        if (raw.prepare('SELECT COUNT(*) n FROM usage_rollup_days WHERE dirty=1').get().n === pending) break;
      }
      preparationMs=performance.now()-begin;
    }
    for (let pass = 0; pass < Number(process.env.BENCH_PASSES || 5); pass++) {
      metrics = { queries: 0, sqlMs: 0, rows: 0, bytes: 0 };
      const begin = performance.now();
      let output;
      if (scenario.quota) {
        const quotaMetadata = { ...metadata, weeklyQuotaHistory: [{
          startsAt: new Date(stats.first).toISOString(), resetsAt: metadata.weeklyQuota.startsAt,
          observedAt: metadata.weeklyQuota.startsAt, usedPercent: 50,
        }] };
        const builder = createQuotaDetail(quotaMetadata, null, now);
        if (readQuotaCalibration && readQuotaSamples && builder.addHistoricalSample) {
          await readQuotaCalls(adapter,owner,new Date(builder.callsFrom).toISOString(),new Date(builder.sampleTo).toISOString(),(call,node)=>builder.addRecent(call,node));
          await readQuotaCalibration(adapter,owner,builder.calibrationWindows,builder.calibrationNodeId,(call,node)=>builder.addCalibration(call,node));
          await readQuotaSamples(adapter,owner,builder.sampleFrom,builder.callsFrom-1,builder.sampleAnchor,builder.calibrationNodeId,(call,node)=>builder.addHistoricalSample(call,node));
        }
        else if (readQuotaCalls) await readQuotaCalls(adapter, owner, new Date(builder.from).toISOString(), new Date(builder.to).toISOString(), (call, node) => builder.add(call, node));
        else await readSessionSlices(adapter, owner, new Date(builder.from).toISOString(), new Date(builder.to).toISOString(), true, null, row => {
          for (const call of JSON.parse(row.snapshot_json).calls) builder.add(call, row.node_id);
        }, true);
        output = builder.finish();
      } else {
        const query = { ...scenario, end: now.toISOString(), pricing, pageSize: 25 };
        if (scenario.view === 'overview') query.buckets = Array.from({ length: 12 }, (_, i) => ({
          start: new Date(+now - (12 - i) * 7 * 86400000).toISOString(),
          end: new Date(+now - (11 - i) * 7 * 86400000).toISOString(),
        }));
        const builder = createPageData(metadata, query, now);
        await readSessionSlices(adapter, owner, scenario.start, query.end, false, null, row => builder.add({ ...JSON.parse(row.snapshot_json), id: row.session_id, nodeId: row.node_id }), false, { aggregate: true, rollups: Boolean(adapter.batch), prepareCache:false, buckets: query.buckets });
        if (builder.weekly) await readSessionSlices(adapter, owner, new Date(builder.weekly.from).toISOString(), new Date(builder.weekly.to).toISOString(), false, null, row => builder.addWeekly({ ...JSON.parse(row.snapshot_json), id: row.session_id, nodeId: row.node_id }), false, { aggregate: true, rollups: Boolean(adapter.batch), prepareCache:false });
        output = builder.finish();
      }
      const elapsedMs = performance.now() - begin;
      const hash = createHash('sha256').update(JSON.stringify(output)).digest('hex');
      if (expected) assert.equal(hash, expected, 'Non-deterministic page payload');
      expected = hash;
      samples.push({ elapsedMs, ...metrics });
    }
    const median = key => samples.map(s => s[key]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    results.push({ scenario: scenario.name, preparationMs:+preparationMs.toFixed(2), medianMs: +median('elapsedMs').toFixed(2), sqlMs: +median('sqlMs').toFixed(2), queries: median('queries'), rows: median('rows'), bytes: median('bytes'), hash: expected, samplesMs: samples.map(s => +s.elapsedMs.toFixed(2)) });
    console.error(`${scenario.name}: ${results.at(-1).medianMs} ms`);
  }
  console.log(JSON.stringify({ runtime: process.version, dataset: process.env.BENCH_DATABASE ? 'local-read-only' : 'synthetic', calls: stats.calls, sessions: raw.prepare('SELECT COUNT(*) n FROM mesh_sessions').get().n, results }, null, 2));
} finally { raw.close(); }
