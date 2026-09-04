import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign,
  verify,
} from "node:crypto";

export const MESH_PROTOCOL_VERSION = 1;
export const MESH_MAX_CLOCK_SKEW_MS = 10 * 60 * 1_000;
export const MESH_MAX_ALIAS_LENGTH = 80;

function canonicalValue(value) {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => [key, canonicalValue(value[key])]));
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalValue(value));
}

export function sha256(value) {
  const input = typeof value === "string" || ArrayBuffer.isView(value) ? value : canonicalJson(value);
  return createHash("sha256").update(input).digest("hex");
}

export function normalizeNodeAlias(value) {
  const alias = String(value || "").trim().replace(/\s+/g, " ");
  if (!alias || alias.length > MESH_MAX_ALIAS_LENGTH || /[\u0000-\u001f\u007f]/.test(alias)) {
    throw new Error(`L’alias de machine doit contenir entre 1 et ${MESH_MAX_ALIAS_LENGTH} caractères imprimables.`);
  }
  return alias;
}

export function generateNodeIdentity() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  return {
    publicKey: publicKey.export({ type: "spki", format: "pem" }),
    privateKey: privateKey.export({ type: "pkcs8", format: "pem" }),
  };
}

export function publicKeyFingerprint(publicKey) {
  const der = createPublicKey(publicKey).export({ type: "spki", format: "der" });
  return sha256(der);
}

function signedFields(envelope) {
  return {
    version: envelope.version,
    nodeId: envelope.nodeId,
    sequence: envelope.sequence,
    sentAt: envelope.sentAt,
    payloadHash: envelope.payloadHash,
  };
}

export function createSignedEnvelope({ nodeId, sequence, payload, privateKey, sentAt = new Date().toISOString() }) {
  if (!nodeId || !Number.isSafeInteger(sequence) || sequence < 1) throw new Error("Identité ou séquence Mesh invalide.");
  const envelope = {
    version: MESH_PROTOCOL_VERSION,
    nodeId,
    sequence,
    sentAt,
    payloadHash: sha256(payload),
    payload,
  };
  envelope.signature = sign(null, Buffer.from(canonicalJson(signedFields(envelope))), createPrivateKey(privateKey)).toString("base64url");
  return envelope;
}

export function verifySignedEnvelope(envelope, publicKey, options = {}) {
  if (!envelope || envelope.version !== MESH_PROTOCOL_VERSION) throw new Error("Version du protocole Mesh non prise en charge.");
  if (!envelope.nodeId || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) throw new Error("Enveloppe Mesh invalide.");
  if (sha256(envelope.payload) !== envelope.payloadHash) throw new Error("Le contenu Mesh ne correspond pas à son empreinte.");
  const sentAt = Date.parse(envelope.sentAt);
  const now = options.now ?? Date.now();
  const maxClockSkewMs = options.maxClockSkewMs ?? MESH_MAX_CLOCK_SKEW_MS;
  if (!Number.isFinite(sentAt) || Math.abs(now - sentAt) > maxClockSkewMs) throw new Error("Horodatage Mesh expiré ou invalide.");
  const valid = verify(
    null,
    Buffer.from(canonicalJson(signedFields(envelope))),
    createPublicKey(publicKey),
    Buffer.from(String(envelope.signature || ""), "base64url"),
  );
  if (!valid) throw new Error("Signature Mesh invalide.");
  return true;
}

function finiteUsage(usage) {
  const fields = ["inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens"];
  return usage && fields.every((field) => Number.isFinite(usage[field]) && usage[field] >= 0)
    && (!Object.hasOwn(usage, "cacheWriteInputTokens") || Number.isFinite(usage.cacheWriteInputTokens) && usage.cacheWriteInputTokens >= 0);
}

const PAYLOAD_KEYS = new Set(["kind", "snapshotVersion", "analyzerVersion", "generatedAt", "privacy", "shortQuota", "quota", "quotaHistory", "upserts", "removals"]);
const READ_PAYLOAD_KEYS = new Set(["kind", "requestVersion"]);
const SESSION_KEYS = new Set(["id", "sourceSessionId", "nodeId", "nodeAlias", "title", "startedAt", "updatedAt", "cwd", "projectName", "projectGitHubUrl", "source", "cliVersion", "modelProvider", "models", "exchanges", "completedExchanges", "userMessages", "assistantMessages", "modelCalls", "durationMs", "usage", "turns", "calls", "parseErrors"]);
const TURN_KEYS = new Set(["id", "startedAt", "completedAt", "durationMs", "model", "effort", "serviceTier", "calls", "usage"]);
const CALL_KEYS = new Set(["timestamp", "turnId", "model", "effort", "serviceTier", "usage"]);
const USAGE_KEYS = new Set(["inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens", "cacheWriteInputTokens"]);
const QUOTA_KEYS = new Set(["usedPercent", "remainingPercent", "peakUsedPercent", "windowMinutes", "startsAt", "endsAt", "resetsAt", "resetsAvailable", "observedAt", "firstObservedAt", "peakObservedAt", "planType", "planTypes", "nodeId", "nodeAlias", "receivedAt", "observations"]);

function validQuota(quota) {
  return hasOnlyKeys(quota, QUOTA_KEYS) && (quota.observations === undefined || Array.isArray(quota.observations)
    && quota.observations.length <= 10000 && quota.observations.every((point) =>
      hasOnlyKeys(point, new Set(["observedAt", "usedPercent"]))
      && typeof point.observedAt === "string" && Number.isFinite(Date.parse(point.observedAt))
      && Number.isFinite(point.usedPercent) && point.usedPercent >= 0 && point.usedPercent <= 100));
}

function hasOnlyKeys(value, allowed) {
  return value && typeof value === "object" && !Array.isArray(value) && Object.keys(value).every((key) => allowed.has(key));
}

function validSession(session) {
  return session
    && hasOnlyKeys(session, SESSION_KEYS)
    && typeof session.id === "string"
    && session.id.length > 0
    && session.id.length <= 256
    && typeof session.title === "string"
    && session.title.length <= 300
    && (session.cwd === null || (typeof session.cwd === "string" && session.cwd.length <= 512))
    && (session.projectName == null || (typeof session.projectName === "string" && session.projectName.length <= 200))
    && (session.projectGitHubUrl == null || (typeof session.projectGitHubUrl === "string" && /^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(session.projectGitHubUrl)))
    && Array.isArray(session.calls)
    && session.calls.length <= 100_000
    && session.calls.every((call) => hasOnlyKeys(call, CALL_KEYS) && hasOnlyKeys(call.usage, USAGE_KEYS) && finiteUsage(call.usage))
    && Array.isArray(session.turns)
    && session.turns.length <= 100_000
    && session.turns.every((turn) => hasOnlyKeys(turn, TURN_KEYS) && hasOnlyKeys(turn.usage, USAGE_KEYS) && finiteUsage(turn.usage))
    && hasOnlyKeys(session.usage, USAGE_KEYS)
    && finiteUsage(session.usage);
}

export function validateSyncPayload(payload) {
  if (!hasOnlyKeys(payload, PAYLOAD_KEYS) || payload.kind !== "sync" || payload.snapshotVersion !== 1) throw new Error("Charge utile Mesh invalide.");
  if (!Number.isFinite(Date.parse(payload.generatedAt))) throw new Error("Date de génération Mesh invalide.");
  if (!Array.isArray(payload.upserts) || payload.upserts.length > 100) throw new Error("Lot de sessions Mesh trop volumineux.");
  if (!payload.upserts.every(validSession)) throw new Error("Une session Mesh est invalide.");
  if (!Array.isArray(payload.removals) || payload.removals.length > 100 || !payload.removals.every((id) => typeof id === "string" && id.length <= 256)) {
    throw new Error("Liste de suppressions Mesh invalide.");
  }
  if (payload.upserts.length + payload.removals.length > 100) throw new Error("Lot de mutations Mesh trop volumineux.");
  if (payload.quota != null && !validQuota(payload.quota)) throw new Error("Quota Mesh invalide.");
  if (payload.shortQuota != null && !validQuota(payload.shortQuota)) throw new Error("Quota court Mesh invalide.");
  if (payload.quotaHistory !== undefined && (!Array.isArray(payload.quotaHistory) || payload.quotaHistory.length > 500 || !payload.quotaHistory.every(validQuota))) throw new Error("Historique de quota Mesh invalide.");
  if (!hasOnlyKeys(payload.privacy, new Set(["projectMode", "includeTitles"])) || !["hash", "basename", "full"].includes(payload.privacy.projectMode) || typeof payload.privacy.includeTitles !== "boolean") {
    throw new Error("Profil de confidentialité Mesh invalide.");
  }
  return payload;
}

export function validateReadPayload(payload) {
  if (!hasOnlyKeys(payload, READ_PAYLOAD_KEYS) || payload.kind !== "read" || payload.requestVersion !== 1) {
    throw new Error("Demande de lecture Mesh invalide.");
  }
  return payload;
}
