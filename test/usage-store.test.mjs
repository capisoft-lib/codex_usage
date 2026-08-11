import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { UsageStore } from "../src/usage-store.mjs";

const quietLogger = { log() {}, warn() {}, error() {} };

test("serves a memory snapshot and only analyzes changed usage", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-store-"));
  const snapshotPath = path.join(directory, "usage.json");
  let analyses = 0;
  let currentFingerprint = "one";
  const store = new UsageStore({
    analyze: async () => ({ generatedAt: `2026-08-11T00:00:0${++analyses}.000Z`, sessions: [], errors: [] }),
    fingerprint: async () => currentFingerprint,
    snapshotPath,
    refreshIntervalMs: 0,
    logger: quietLogger,
  });

  assert.equal(await store.loadSnapshot(), false);
  assert.match(await store.getSerializedUsage(), /"sessions":\[\]/);
  assert.equal(analyses, 1);

  await store.refresh();
  assert.equal(analyses, 1);
  currentFingerprint = "two";
  await store.refresh();
  assert.equal(analyses, 2);
  await store.refresh(true);
  assert.equal(analyses, 3);

  const persisted = JSON.parse(await readFile(snapshotPath, "utf8"));
  assert.equal(persisted.fingerprint, "two");
  assert.equal(persisted.data.generatedAt, "2026-08-11T00:00:03.000Z");
});

test("loads a persisted snapshot before any new analysis", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-restart-"));
  const snapshotPath = path.join(directory, "usage.json");
  const first = new UsageStore({
    analyze: async () => ({ generatedAt: "2026-08-11T10:00:00.000Z", sessions: [{ id: "cached" }], errors: [] }),
    fingerprint: async () => "stable",
    snapshotPath,
    refreshIntervalMs: 0,
    logger: quietLogger,
  });
  await first.getUsage();

  let analyses = 0;
  const restarted = new UsageStore({
    analyze: async () => { analyses += 1; return { generatedAt: "new", sessions: [], errors: [] }; },
    fingerprint: async () => "stable",
    snapshotPath,
    refreshIntervalMs: 0,
    logger: quietLogger,
  });
  assert.equal(await restarted.loadSnapshot(), true);
  assert.equal((await restarted.getUsage()).sessions[0].id, "cached");
  assert.equal(analyses, 0);
  assert.equal(restarted.status().ready, true);
});
