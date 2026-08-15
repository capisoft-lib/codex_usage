import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createUsageCollector } from "../src/usage-collector.mjs";

const quietLogger = { log() {}, warn() {}, error() {} };

function usage(generatedAt = "2026-08-14T18:00:00.000Z") {
  return {
    analyzerVersion: 3,
    generatedAt,
    source: { mode: "local", sessionsAvailable: true, archivedSessionsAvailable: false, sessionIndexAvailable: true },
    weeklyQuota: null,
    sessions: [],
    errors: [],
  };
}

test("collector exposes the common dashboard contract without an HTTP server", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-collector-"));
  let analyses = 0;
  const collector = await createUsageCollector({
    root,
    env: { SNAPSHOT_PATH: "", REFRESH_INTERVAL_MS: "1000" },
    analyze: async () => usage(`2026-08-14T18:00:0${++analyses}.000Z`),
    fingerprint: async () => `fingerprint-${analyses}`,
    logger: quietLogger,
  });

  assert.deepEqual(collector.capabilities().sources, ["local"]);
  const data = await collector.localUsage();
  assert.equal(data.apiVersion, 1);
  assert.equal(data.generatedAt, "2026-08-14T18:00:01.000Z");
  assert.match(await collector.localUsageJson(), /"apiVersion":1/);
  await assert.rejects(() => collector.centralizedUsage(), (error) => error.code === "mesh_not_configured" && error.status === 503);
  collector.stop();
});
