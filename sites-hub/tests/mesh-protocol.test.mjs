import assert from "node:assert/strict";
import test from "node:test";
import { createSignedEnvelope, generateNodeIdentity } from "../../src/mesh-protocol.mjs";
import { validatePayload, validateReadPayload, verifyEnvelope } from "../lib/mesh.ts";

test("Sites verifies envelopes produced by the desktop agent", async () => {
  const identity = generateNodeIdentity();
  const payload = {
    kind: "sync",
    snapshotVersion: 1,
    analyzerVersion: 3,
    generatedAt: new Date().toISOString(),
    privacy: { projectMode: "hash", includeTitles: false },
    quota: null,
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
