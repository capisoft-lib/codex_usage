import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { openSqlite, transaction } from "../src/storage/sqlite.mjs";
import { LocalRepository } from "../src/storage/local-repository.mjs";
import { readSessionSlices } from "../src/storage/relational-reader.mjs";
import { createPageData } from "../public/page-data.js";
import { UsageStore } from "../src/usage-store.mjs";
import { MeshHubStore } from "../src/mesh-hub-store.mjs";
import { PRICING_CATALOG } from '../public/pricing-catalog.js';

const quiet = { log() {}, warn() {}, error() {} };
function fixture() {
  const calls = [];
  for (let i = 0; i < 500; i++)
    calls.push({
      timestamp: new Date(Date.UTC(2026, 8, 10, 0, i)).toISOString(),
      turnId: "turn",
      model: i % 3 ? "gpt-5.6-sol" : "gpt-6-astra",
      effort: i % 2 ? "high" : "low",
      serviceTier: i % 4 ? "default" : "priority",
      usage: {
        inputTokens: 10000 + i,
        cachedInputTokens: 9000,
        outputTokens: 100 + i,
        reasoningOutputTokens: 10,
        totalTokens: 10100 + i * 2,
      },
    });
  calls.push(
    ...[
      { inputTokens: 280000, cachedInputTokens: 200000, outputTokens: 400 },
      { inputTokens: 10, cachedInputTokens: 10, outputTokens: 0 },
      {
        inputTokens: 10,
        cachedInputTokens: 10,
        cacheWriteInputTokens: 0,
        outputTokens: 0,
      },
      {
        inputTokens: 10,
        cachedInputTokens: 4,
        cacheWriteInputTokens: 2,
        outputTokens: 5,
      },
      { inputTokens: -10, cachedInputTokens: 2, outputTokens: 1 },
      { inputTokens: 10, cachedInputTokens: 11, outputTokens: 1 },
    ].map((usage) => ({
      timestamp: "2026-09-10T02:00:00Z",
      model: "gpt-5.6-sol",
      serviceTier: "default",
      usage,
    })),
  );
  return {
    analyzerVersion: 10,
    generatedAt: "2026-09-11T00:00:00.000Z",
    sessions: [
      {
        id: "s",
        title: "Example",
        startedAt: "2025-01-01",
        updatedAt: "2026-09-11",
        cwd: "/project",
        models: ["gpt-5.6-sol", "gpt-6-astra"],
        calls,
        turns: [
          {
            id: "turn",
            startedAt: "2026-09-10T00:00:00Z",
            completedAt: "2026-09-10T01:00:00Z",
            durationMs: 3600000,
            model: "gpt-5.6-sol",
            calls: 500,
            usage: {},
          },
        ],
      },
    ],
  };
}
function closeEnough(actual, expected, location = "result") {
  if (typeof expected === "number") {
    assert.ok(
      Math.abs(actual - expected) <= Math.max(1, Math.abs(expected)) * 1e-10,
      `${location}: ${actual} != ${expected}`,
    );
    return;
  }
  if (expected && typeof expected === "object") {
    assert.deepEqual(
      Object.keys(actual).sort(),
      Object.keys(expected).sort(),
      location,
    );
    for (const key of Object.keys(expected))
      closeEnough(actual[key], expected[key], `${location}.${key}`);
  } else assert.equal(actual, expected, location);
}

test("SQL aggregation matches raw pricing, filters, arbitrary buckets and pagination", async () => {
  const db = openSqlite();
  try {
    const repository = new LocalRepository(db),
      data = fixture();
    repository.saveUsage(data, "f", data.generatedAt);
    const stored = JSON.parse(
      db.raw.prepare("SELECT snapshot_json FROM mesh_sessions").get()
        .snapshot_json,
    );
    assert.equal(stored.calls, undefined);
    assert.equal(stored.turns, undefined);
    assert.equal(
      db.raw.prepare("SELECT COUNT(*) n FROM usage_calls").get().n,
      506,
    );
    for (const view of [
      "overview",
      "projects",
      "conversations",
      "detail",
      "pricing",
    ])
      for (const mode of ["historical", "current", "custom"]) {
        const query = {
          view,
          start: "2026-09-10T01:01:00Z",
          end: "2026-09-10T08:30:00Z",
          pricing: { schemaVersion: 2, mode, asOf: "2026-09-16" },
          buckets: [
            {
              start: "2026-09-10T01:01:00Z",
              end: "2026-09-10T02:02:00Z",
              inclusiveEnd: true,
            },
            { start: "2026-09-10T02:02:00Z", end: "2026-09-10T08:30:00Z" },
          ],
          pageSize: 10,
        };
        const expected = createPageData(repository.metadata(), query),
          actual = createPageData(repository.metadata(), query);
        // Use the public record shape on both paths, as the HTTP servers do.
        const full = repository.sessions("local")[0];
        expected.add(full);
        let returned = 0;
        await readSessionSlices(
          db,
          "local",
          query.start,
          query.end,
          false,
          null,
          (row) => {
            const value = JSON.parse(row.snapshot_json);
            returned += value.calls.length;
            actual.add(value);
          },
          false,
          {
            aggregate: !["detail", "pricing"].includes(view),
            buckets: query.buckets,
          },
        );
        closeEnough(actual.finish(), expected.finish(), `${view}/${mode}`);
        if (view === "overview")
          assert.ok(
            returned < 100,
            `Only ${returned} SQL groups should cross the adapter`,
          );
      }
    const plan = db.raw
      .prepare(
        "EXPLAIN QUERY PLAN SELECT * FROM usage_calls WHERE node_id=? AND session_id=? AND timestamp_ms BETWEEN ? AND ?",
      )
      .all("local", "s", 1, 2);
    assert.ok(
      plan.some((row) => row.detail.includes("usage_calls_session_time")),
    );
  } finally {
    db.close();
  }
});

test("relational ingestion preserves duplicate events, deletes children, and rolls back atomically", () => {
  const db = openSqlite();
  try {
    const repo = new LocalRepository(db),
      data = fixture();
    repo.saveUsage(data, "first", data.generatedAt);
    const initial = repo.sessions("local")[0];
    assert.throws(
      () =>
        transaction(db.raw, () => {
          repo.writeSession("local", { ...initial, calls: [] });
          throw Error("interrupted");
        }),
      /interrupted/,
    );
    assert.equal(repo.sessions("local")[0].calls.length, 506);
    repo.saveUsage(
      {
        ...data,
        sessions: [
          {
            ...data.sessions[0],
            calls: [data.sessions[0].calls[0], data.sessions[0].calls[0]],
          },
        ],
      },
      "second",
      data.generatedAt,
    );
    assert.equal(
      db.raw.prepare("SELECT COUNT(*) n FROM usage_calls").get().n,
      2,
    );
    repo.saveUsage({ ...data, sessions: [] }, "third", data.generatedAt);
    for (const table of ["usage_calls", "usage_turns", "usage_session_models"])
      assert.equal(
        db.raw.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n,
        0,
      );
  } finally {
    db.close();
  }
});

test('grouped pricing preserves catalog boundaries, context bands and cache-write evidence', async () => {
  const db=openSqlite();
  try {
    const repo=new LocalRepository(db), calls=[];
    for(const rate of PRICING_CATALOG.filter(rate=>rate.billing==='api')) {
      for(const offset of [-1,0,86400000]) for(const input of [0,10000,272000,272001,300000]) for(const tier of ['default','fast']) {
        for(let i=0;i<3;i++) calls.push({timestamp:new Date(Date.parse(rate.effectiveFrom)+offset).toISOString(),model:rate.model,serviceTier:tier,
          usage:{inputTokens:input,cachedInputTokens:Math.floor(input*(i+1)/4),outputTokens:17+i,totalTokens:input+17+i,
            ...(i===0?{}:{cacheWriteInputTokens:i===1?0:Math.floor(input/8)})}});
      }
    }
    const data={generatedAt:'2026-09-16',sessions:[{id:'all-rates',calls,turns:[]}]};
    repo.saveUsage(data,'all-rates','2026-09-16');
    for(const mode of ['historical','current','custom']) {
      const query={view:'overview',start:'2020-01-01',end:'2099-01-01',pricing:{schemaVersion:2,mode,asOf:'2026-09-16'}};
      const raw=createPageData(repo.metadata(),query),grouped=createPageData(repo.metadata(),query);
      raw.add(repo.sessions('local')[0]);
      await readSessionSlices(db,'local',query.start,query.end,false,null,row=>grouped.add(JSON.parse(row.snapshot_json)),false,{aggregate:true});
      closeEnough(grouped.finish(),raw.finish(),mode);
    }
  } finally {db.close();}
});

test("legacy JSON migration is durable, idempotent, and keeps the source backup", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "relational-migration-"));
  const snapshotPath = path.join(directory, "usage.json");
  const data = fixture(),
    legacy = JSON.stringify({
      version: 1,
      data,
      fingerprint: "old",
      savedAt: data.generatedAt,
    });
  await writeFile(snapshotPath, legacy);
  let store;
  try {
    const options = {
      snapshotPath,
      analyze: async () => {
        throw Error("must not reparse");
      },
      fingerprint: async () => "old",
      logger: quiet,
    };
    store = new UsageStore(options);
    assert.equal(await store.loadSnapshot(), true);
    assert.equal((await store.getUsage()).sessions[0].calls.length, 506);
    store.database.close();
    store = null;
    assert.equal(await readFile(snapshotPath, "utf8"), legacy);
    await writeFile(snapshotPath, "corrupted legacy no longer used");
    store = new UsageStore(options);
    assert.equal(await store.loadSnapshot(), true);
    assert.equal((await store.getUsage()).sessions[0].calls.length, 506);
    assert.equal(
      store.database.raw.prepare("PRAGMA integrity_check").get()
        .integrity_check,
      "ok",
    );
  } finally {
    store?.database.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("Mesh migration preserves identities, revocations, and replay counters", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "relational-mesh-"));
  let hub;
  try {
    const storePath = path.join(directory, "mesh.json");
    const legacy = {
      version: 1,
      enrollments: { old: { expiresAt: "2027-01-01", usedAt: "2026-01-01" } },
      nodes: {
        node: {
          id: "node",
          alias: "PC",
          publicKey: "public-key",
          fingerprint: "fingerprint",
          enrolledAt: "2026-01-01",
          lastSequence: 42,
          revokedAt: "2026-09-01",
          sessions: { s: fixture().sessions[0] },
        },
      },
    };
    await writeFile(storePath, JSON.stringify(legacy));
    hub = new MeshHubStore({ storePath });
    assert.equal(await hub.load(), true);
    assert.equal(hub.getNode("node").lastSequence, 42);
    assert.equal(hub.aggregate().sessions.length, 0);
    assert.equal(hub.repository.sessions("node")[0].calls.length, 506);
    hub.close();
    hub = new MeshHubStore({ storePath });
    assert.equal(await hub.load(), true);
    assert.equal(hub.getNode("node").publicKey, "public-key");
    assert.equal(hub.getNode("node").lastSequence, 42);
  } finally {
    hub?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
