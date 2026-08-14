import assert from "node:assert/strict";
import test from "node:test";
import { MeshHubStore } from "../src/mesh-hub-store.mjs";
import { createSignedEnvelope, generateNodeIdentity } from "../src/mesh-protocol.mjs";

const now = Date.parse("2026-08-14T10:00:00.000Z");

function session(id = "session-1") {
  return {
    id,
    title: "Conversation 12345678",
    startedAt: "2026-08-14T09:00:00.000Z",
    updatedAt: "2026-08-14T09:10:00.000Z",
    cwd: "project-123456789abc",
    source: "cli",
    cliVersion: null,
    modelProvider: null,
    models: ["gpt-test"],
    exchanges: 1,
    completedExchanges: 1,
    userMessages: 1,
    assistantMessages: 1,
    modelCalls: 1,
    durationMs: 1_000,
    usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13 },
    turns: [],
    calls: [{ timestamp: "2026-08-14T09:05:00.000Z", turnId: "turn-1", model: "gpt-test", effort: "medium", serviceTier: "default", usage: { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13 } }],
    parseErrors: 0,
  };
}

test("hub enrolls once, verifies signed updates, blocks replay, and aggregates node identity", async () => {
  const store = new MeshHubStore();
  const enrollment = await store.createEnrollment(now);
  const identity = generateNodeIdentity();
  const node = await store.enroll({ code: enrollment.code, alias: "PC Bureau", publicKey: identity.publicKey }, now);
  await assert.rejects(() => store.enroll({ code: enrollment.code, alias: "Copie", publicKey: identity.publicKey }, now), /invalide ou expiré/);

  const payload = {
    kind: "sync", snapshotVersion: 1, analyzerVersion: 3,
    generatedAt: new Date(now).toISOString(), privacy: { projectMode: "hash", includeTitles: false },
    quota: { remainingPercent: 80, observedAt: new Date(now).toISOString() },
    upserts: [session()], removals: [],
  };
  const envelope = createSignedEnvelope({ nodeId: node.nodeId, sequence: 1, payload, privateKey: identity.privateKey, sentAt: new Date(now).toISOString() });
  const accepted = await store.ingest(envelope, now);
  assert.equal(accepted.sessions, 1);
  await assert.rejects(() => store.ingest(envelope, now), /déjà traitée/);

  const aggregate = store.aggregate();
  assert.equal(aggregate.nodes[0].alias, "PC Bureau");
  assert.equal(aggregate.sessions[0].nodeAlias, "PC Bureau");
  assert.equal(aggregate.weeklyQuota.remainingPercent, 80);
  assert.equal(aggregate.weeklyQuota.nodeId, node.nodeId);

  const readEnvelope = createSignedEnvelope({ nodeId: node.nodeId, sequence: 2, payload: { kind: "read", requestVersion: 1 }, privateKey: identity.privateKey, sentAt: new Date(now).toISOString() });
  const centralized = await store.readUsage(readEnvelope, now);
  assert.equal(centralized.sessions.length, 1);
  assert.equal(centralized.sessions[0].nodeAlias, "PC Bureau");
  await assert.rejects(() => store.readUsage(readEnvelope, now), /déjà traitée/);
});
