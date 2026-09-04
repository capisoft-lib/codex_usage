import assert from "node:assert/strict";
import test from "node:test";
import { createSignedEnvelope, generateNodeIdentity } from "../../src/mesh-protocol.mjs";
import { MeshRequestError, readJsonBody, validatePayload, validateReadPayload, verifyEnvelope } from "../lib/mesh.ts";
import { publicMeshIngressUrl } from "../lib/mesh-config.ts";
import { sanitizeUsageForMesh } from "../../src/mesh-privacy.mjs";

test("Sites preserves measured quota history while rejecting private or invalid point fields", () => {
  const quota = { usedPercent: 25, observations: [{ observedAt: "2026-09-01T01:00:00Z", usedPercent: 10 }] };
  const payload = { kind: "sync", snapshotVersion: 1, generatedAt: "2026-09-01T02:00:00Z", privacy: { projectMode: "hash", includeTitles: false }, upserts: [], removals: [], quota, quotaHistory: [quota] };
  assert.doesNotThrow(() => validatePayload(payload));
  for (const point of [{ observedAt: "bad", usedPercent: 10 }, { observedAt: "2026-09-01T01:00:00Z", usedPercent: null }, { ...quota.observations[0], prompt: "private" }]) {
    assert.throws(() => validatePayload({ ...payload, quota: { ...quota, observations: [point] } }), /Quota/);
  }
});

test("Sites exposes only a canonical HTTPS ingress origin in association commands", () => {
  assert.equal(publicMeshIngressUrl("https://mesh.example/"), "https://mesh.example");
  assert.throws(() => publicMeshIngressUrl("http://mesh.example"), /HTTPS origin/);
  assert.throws(() => publicMeshIngressUrl("https://mesh.example/admin"), /HTTPS origin/);
  assert.throws(() => publicMeshIngressUrl("https://user:secret@mesh.example"), /HTTPS origin/);
});

test("Sites verifies envelopes produced by the desktop agent", async () => {
  const identity = generateNodeIdentity();
  const payload = {
    kind: "sync",
    snapshotVersion: 1,
    analyzerVersion: 3,
    generatedAt: new Date().toISOString(),
    privacy: { projectMode: "hash", includeTitles: false },
    shortQuota: { usedPercent: 10, remainingPercent: 90, windowMinutes: 300, resetsAt: new Date().toISOString() },
    quota: null,
    quotaHistory: [],
    upserts: [],
    removals: [],
  };
  validatePayload(payload);
  const envelope = createSignedEnvelope({ nodeId: "node_compatibility", sequence: 1, payload, privateKey: identity.privateKey });
  await assert.doesNotReject(() => verifyEnvelope(envelope, identity.publicKey));
  envelope.payloadHash = "0".repeat(64);
  await assert.rejects(() => verifyEnvelope(envelope, identity.publicKey), /Empreinte/);
});

test("Sites accepts only the strict signed-read payload shape", () => {
  assert.doesNotThrow(() => validateReadPayload({ kind: "read", requestVersion: 1 }));
  assert.throws(() => validateReadPayload({ kind: "read", requestVersion: 1, ownerId: "forbidden" }), /invalide/);
});

test("Sites accepts optional Astra cache-write counters and still accepts old agents", () => {
  const usage = { inputTokens: 100, cachedInputTokens: 20, cacheWriteInputTokens: 30, outputTokens: 10, reasoningOutputTokens: 0, totalTokens: 110 };
  const mesh = sanitizeUsageForMesh({ sessions: [{ id: "astra-compat", title: "Astra", models: ["gpt-6-astra"], usage, calls: [{ timestamp: "2026-09-04", model: "gpt-6-astra", serviceTier: "fast", usage }] }], generatedAt: "2026-09-04T00:00:00Z" }, { projectSalt: "fixture" });
  const payload = { kind: "sync", snapshotVersion: 1, analyzerVersion: 8, generatedAt: mesh.generatedAt, privacy: mesh.privacy, upserts: mesh.sessions, removals: [] };
  assert.doesNotThrow(() => validatePayload(payload));
  payload.upserts[0].calls[0].usage.cacheWriteInputTokens = -1;
  assert.throws(() => validatePayload(payload), /invalide/);
  delete payload.upserts[0].calls[0].usage.cacheWriteInputTokens;
  delete payload.upserts[0].usage.cacheWriteInputTokens;
  assert.doesNotThrow(() => validatePayload(payload));
});

test("Sites rejects fields outside the minimized protocol", () => {
  assert.throws(() => validatePayload({
    kind: "sync", snapshotVersion: 1, analyzerVersion: 3, generatedAt: new Date().toISOString(),
    privacy: { projectMode: "hash", includeTitles: false }, quota: null, upserts: [], removals: [],
    rawConversation: "must not be stored",
  }), /invalide/);
});

test("Sites enforces request limits even without a Content-Length header", async () => {
  const request = new Request("https://site.example/api/mesh/ingest", {
    method: "POST",
    body: JSON.stringify({ value: "larger than the limit" }),
  });
  await assert.rejects(
    () => readJsonBody(request, 8),
    (error) => error instanceof MeshRequestError && error.status === 413,
  );
});

test("Sites parses bounded JSON and rejects malformed bodies", async () => {
  const valid = new Request("https://site.example/api/mesh/ingest", {
    method: "POST",
    body: JSON.stringify({ kind: "read" }),
  });
  assert.deepEqual(await readJsonBody(valid, 1024), { kind: "read" });

  const invalid = new Request("https://site.example/api/mesh/ingest", { method: "POST", body: "{" });
  await assert.rejects(
    () => readJsonBody(invalid, 1024),
    (error) => error instanceof MeshRequestError && error.status === 400,
  );
});
