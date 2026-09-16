// Synthetic, reproducible comparison; never reads the user's Codex history.
import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { openSqlite } from "../src/storage/sqlite.mjs";
import { LocalRepository } from "../src/storage/local-repository.mjs";
import { readSessionSlices } from "../src/storage/relational-reader.mjs";
import { createPageData } from "../public/page-data.js";

const db = openSqlite(),
  repository = new LocalRepository(db);
const sessionCount = Number(process.env.BENCH_SESSIONS || 200),
  callsPerSession = Number(process.env.BENCH_CALLS || 1000);
const sessions = Array.from({ length: sessionCount }, (_, s) => ({
  id: `s${s}`,
  title: `Session ${s}`,
  cwd: `/project/${s % 10}`,
  models: ["gpt-5.6-sol"],
  startedAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-09-16T00:00:00.000Z",
  turns: [],
  calls: Array.from({ length: callsPerSession }, (_, i) => ({
    timestamp: new Date(Date.UTC(2026, 8, 1) + i * 60_000).toISOString(),
    model: "gpt-5.6-sol",
    effort: "high",
    serviceTier: "default",
    usage: {
      inputTokens: 10000 + i,
      cachedInputTokens: 9000,
      outputTokens: 200 + (i % 30),
      reasoningOutputTokens: 50,
      totalTokens: 10200 + i + (i % 30),
    },
  })),
}));
const data = { generatedAt: "2026-09-16T00:00:00.000Z", sessions };
try {
  const start = performance.now();
  repository.saveUsage(data, "benchmark", data.generatedAt);
  const ingestMs = performance.now() - start;
  db.raw.exec("CREATE TEMP TABLE legacy(snapshot TEXT NOT NULL)");
  const insert = db.raw.prepare("INSERT INTO legacy VALUES(?)");
  for (const session of sessions) insert.run(JSON.stringify(session));
  const metadata = repository.metadata();
  const results = [];
  for (const [label, from, to] of [
    ["full", "2026-09-01", "2026-09-16"],
    ["15-minute window", "2026-09-01T01:00:00Z", "2026-09-01T01:15:00Z"],
  ]) {
    const query = {
      view: "overview",
      start: from,
      end: to,
      pricing: { schemaVersion: 2, mode: "historical", asOf: "2026-09-16" },
    };
    const samples = { json: [], legacySites: [], relational: [] };
    let rawBytes = 0,
      legacySitesBytes = 0,
      groupBytes = 0,
      groups = 0;
    for (let pass = 0; pass < 5; pass++) {
      let begin = performance.now();
      const old = createPageData(metadata, query);
      rawBytes = 0;
      for (const row of db.raw
        .prepare("SELECT snapshot FROM legacy")
        .iterate()) {
        rawBytes += Buffer.byteLength(row.snapshot);
        old.add(JSON.parse(row.snapshot));
      }
      const expected = old.finish();
      samples.json.push(performance.now() - begin);
      begin = performance.now();
      const hosted = createPageData(metadata, query);
      legacySitesBytes = 0;
      for (const row of db.raw
        .prepare(
          `SELECT json_set(snapshot,'$.calls',json((SELECT json_group_array(json(value))
        FROM json_each(snapshot,'$.calls') WHERE julianday(json_extract(value,'$.timestamp')) BETWEEN julianday(?) AND julianday(?)))) AS snapshot FROM legacy`,
        )
        .iterate(from, to)) {
        legacySitesBytes += Buffer.byteLength(row.snapshot);
        hosted.add(JSON.parse(row.snapshot));
      }
      assert.equal(
        hosted.finish().pageData.totals.count,
        expected.pageData.totals.count,
      );
      samples.legacySites.push(performance.now() - begin);
      begin = performance.now();
      const next = createPageData(metadata, query);
      groupBytes = 0;
      groups = 0;
      await readSessionSlices(
        db,
        "local",
        from,
        to,
        false,
        null,
        (row) => {
          groupBytes += Buffer.byteLength(row.snapshot_json);
          const session = JSON.parse(row.snapshot_json);
          groups += session.calls.length;
          next.add(session);
        },
        false,
        { aggregate: true },
      );
      const actual = next.finish();
      samples.relational.push(performance.now() - begin);
      assert.equal(
        actual.pageData.totals.count,
        expected.pageData.totals.count,
      );
      assert.ok(
        Math.abs(
          actual.pageData.totals.cost.cost - expected.pageData.totals.cost.cost,
        ) < 1e-7,
      );
    }
    const median = (values) => values.sort((a, b) => a - b)[2];
    results.push({
      range: label,
      jsonMs: +median(samples.json).toFixed(2),
      legacySitesMs: +median(samples.legacySites).toFixed(2),
      relationalMs: +median(samples.relational).toFixed(2),
      speedup: +(median(samples.json) / median(samples.relational)).toFixed(2),
      sitesQuerySpeedup: +(
        median(samples.legacySites) / median(samples.relational)
      ).toFixed(2),
      rawBytes,
      legacySitesBytes,
      groupBytes,
      groups,
    });
  }
  console.log(
    JSON.stringify(
      {
        runtime: process.version,
        sessionCount,
        calls: sessionCount * callsPerSession,
        ingestMs: +ingestMs.toFixed(2),
        results,
      },
      null,
      2,
    ),
  );
} finally {
  db.close();
}
