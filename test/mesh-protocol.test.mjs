import assert from "node:assert/strict";
import test from "node:test";
import {
  canonicalJson,
  createSignedEnvelope,
  generateNodeIdentity,
  validateReadPayload,
  verifySignedEnvelope,
} from "../src/mesh-protocol.mjs";

test("canonical JSON and Ed25519 envelopes are stable and tamper evident", () => {
  assert.equal(canonicalJson({ z: 1, a: { y: 2, x: 3 } }), '{"a":{"x":3,"y":2},"z":1}');
  const identity = generateNodeIdentity();
  const sentAt = "2026-08-14T10:00:00.000Z";
  const envelope = createSignedEnvelope({
    nodeId: "node_test",
    sequence: 1,
    payload: { kind: "sync", value: 42 },
    privateKey: identity.privateKey,
    sentAt,
  });
  assert.equal(verifySignedEnvelope(envelope, identity.publicKey, { now: Date.parse(sentAt) }), true);
  assert.throws(() => verifySignedEnvelope({ ...envelope, payload: { kind: "sync", value: 43 } }, identity.publicKey, { now: Date.parse(sentAt) }), /empreinte/);
  assert.throws(() => verifySignedEnvelope(envelope, identity.publicKey, { now: Date.parse(sentAt) + 11 * 60 * 1_000 }), /expiré/);
});

test("centralized reads use a strict versioned payload", () => {
  assert.deepEqual(validateReadPayload({ kind: "read", requestVersion: 1 }), { kind: "read", requestVersion: 1 });
  assert.throws(() => validateReadPayload({ kind: "read", requestVersion: 1, ownerId: "someone-else" }), /invalide/);
  assert.throws(() => validateReadPayload({ kind: "read", requestVersion: 2 }), /invalide/);
});
