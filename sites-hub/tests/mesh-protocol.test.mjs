import assert from "node:assert/strict";
import test from "node:test";
import { createSignedEnvelope, generateNodeIdentity } from "../../src/mesh-protocol.mjs";
import { MeshRequestError, readJsonBody, validatePayload, validateReadPayload, verifyEnvelope } from "../lib/mesh.ts";

test("Sites verifies envelopes produced by the desktop agent", async () => {
  const identity = generateNodeIdentity();
  const payload = {
    kind: "sync",
    snapshotVersion: 1,
    analyzerVersion: 3,
    generatedAt: new Date().toISOString(),
    privacy: { projectMode: "hash", includeTitles: false },
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
