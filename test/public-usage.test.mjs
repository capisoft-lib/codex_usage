import assert from "node:assert/strict";
import test from "node:test";
import { serializePublicUsage, toPublicUsage } from "../src/public-usage.mjs";

test("public usage exposes only explicitly allowed fields", () => {
  const raw = {
    analyzerVersion: 3,
    generatedAt: "2026-08-12T08:00:00.000Z",
    codexHome: "C:\\Users\\private\\.codex",
    source: {
      mode: "scoped",
      sessionsAvailable: true,
      archivedSessionsAvailable: false,
      sessionIndexAvailable: true,
      sessionsPath: "C:\\Users\\private\\.codex\\sessions",
    },
    weeklyQuota: { usedPercent: 24, remainingPercent: 76, windowMinutes: 10080, resetsAt: "2026-08-20T12:00:00.000Z", resetsAvailable: null, observedAt: "2026-08-13T12:00:00.000Z", planType: "pro", secret: "hidden" },
    nodes: [{ id: "node-1", alias: "PC Bureau", publicKey: "must-not-leak", fingerprint: "private", privacy: { projectMode: "hash", includeTitles: false } }],
    sessions: [{
      id: "session-1",
      title: "Safe title",
      cwd: "C:\\repo",
      usage: { totalTokens: 42 },
      turns: [],
      calls: [],
      filePath: "C:\\Users\\private\\.codex\\sessions\\secret.jsonl",
      fileSize: 123,
      fileModifiedAtMs: 456,
      unexpectedSecret: "must-not-leak",
    }],
    errors: [{ filePath: "private", error: "private detail" }],
  };

  const publicData = toPublicUsage(raw);
  const serialized = serializePublicUsage(raw);
  assert.equal(publicData.apiVersion, 1);
  assert.equal(publicData.sessions[0].id, "session-1");
  assert.equal(publicData.errorCount, 1);
  assert.equal(publicData.weeklyQuota.remainingPercent, 76);
  assert.equal(publicData.weeklyQuota.secret, undefined);
  assert.equal(publicData.sessions[0].filePath, undefined);
  assert.equal(publicData.nodes[0].publicKey, undefined);
  assert.equal(publicData.source.sessionsPath, undefined);
  assert.equal(serialized.includes("private"), false);
  assert.equal(serialized.includes("must-not-leak"), false);
});
