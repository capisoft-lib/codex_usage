export const MAX_CLOCK_SKEW_MS = 10 * 60 * 1000;

export class MeshRequestError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "MeshRequestError";
    this.status = status;
  }
}

export async function readJsonBody<T>(request: Request, maxBytes: number): Promise<T> {
  const declared = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new MeshRequestError("Charge utile trop volumineuse.", 413);
  }

  const reader = request.body?.getReader();
  if (!reader) throw new MeshRequestError("JSON invalide.", 400);
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new MeshRequestError("Charge utile trop volumineuse.", 413);
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new MeshRequestError("JSON invalide.", 400);
  }
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function sha256(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(typeof value === "string" ? value : canonicalJson(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function sha256Bytes(value: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", value);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function pemBytes(pem: string): Uint8Array<ArrayBuffer> {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
  const raw = atob(body);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

function base64UrlBytes(value: string): Uint8Array<ArrayBuffer> {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  return Uint8Array.from(atob(normalized), (character) => character.charCodeAt(0));
}

export type SyncEnvelope = {
  version: number;
  nodeId: string;
  sequence: number;
  sentAt: string;
  payloadHash: string;
  payload: Record<string, unknown>;
  signature: string;
};

export async function verifyEnvelope(envelope: SyncEnvelope, publicKey: string): Promise<void> {
  if (envelope?.version !== 1 || !envelope.nodeId || !Number.isSafeInteger(envelope.sequence) || envelope.sequence < 1) throw new Error("Enveloppe Mesh invalide.");
  const sentAt = Date.parse(envelope.sentAt);
  if (!Number.isFinite(sentAt) || Math.abs(Date.now() - sentAt) > MAX_CLOCK_SKEW_MS) throw new Error("Horodatage Mesh expiré ou invalide.");
  if (await sha256(envelope.payload) !== envelope.payloadHash) throw new Error("Empreinte Mesh invalide.");
  const key = await crypto.subtle.importKey("spki", pemBytes(publicKey), { name: "Ed25519" }, false, ["verify"]);
  const fields = { version: envelope.version, nodeId: envelope.nodeId, sequence: envelope.sequence, sentAt: envelope.sentAt, payloadHash: envelope.payloadHash };
  const valid = await crypto.subtle.verify("Ed25519", key, base64UrlBytes(envelope.signature), new TextEncoder().encode(canonicalJson(fields)));
  if (!valid) throw new Error("Signature Mesh invalide.");
}

export function normalizeAlias(value: unknown): string {
  const alias = String(value ?? "").trim().replace(/\s+/g, " ");
  const hasControlCharacter = [...alias].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
  if (!alias || alias.length > 80 || hasControlCharacter) throw new Error("Alias de machine invalide.");
  return alias;
}

export function validatePayload(value: unknown): asserts value is Record<string, unknown> & { upserts: Record<string, unknown>[]; removals: string[] } {
  const payload = value as Record<string, unknown>;
  const payloadKeys = new Set(["kind", "snapshotVersion", "analyzerVersion", "generatedAt", "privacy", "shortQuota", "quota", "quotaHistory", "upserts", "removals"]);
  const sessionKeys = new Set(["id", "sourceSessionId", "nodeId", "nodeAlias", "title", "startedAt", "updatedAt", "cwd", "projectName", "projectGitHubUrl", "source", "cliVersion", "modelProvider", "models", "exchanges", "completedExchanges", "userMessages", "assistantMessages", "modelCalls", "durationMs", "usage", "turns", "calls", "parseErrors"]);
  const turnKeys = new Set(["id", "startedAt", "completedAt", "durationMs", "model", "effort", "serviceTier", "calls", "usage"]);
  const callKeys = new Set(["timestamp", "turnId", "model", "effort", "serviceTier", "usage"]);
  const usageKeys = new Set(["inputTokens", "cachedInputTokens", "outputTokens", "reasoningOutputTokens", "totalTokens", "cacheWriteInputTokens"]);
  const quotaKeys = new Set(["usedPercent", "remainingPercent", "peakUsedPercent", "windowMinutes", "startsAt", "endsAt", "resetsAt", "resetsAvailable", "observedAt", "firstObservedAt", "peakObservedAt", "planType", "planTypes", "nodeId", "nodeAlias", "receivedAt", "observations"]);
  const hasOnly = (item: unknown, keys: Set<string>) => Boolean(item && typeof item === "object" && !Array.isArray(item) && Object.keys(item).every((key) => keys.has(key)));
  const validQuota = (item: unknown) => {
    if (!hasOnly(item, quotaKeys)) return false;
    const quota = item as Record<string, unknown>;
    return quota.observations === undefined || Array.isArray(quota.observations)
      && quota.observations.length <= 10000 && quota.observations.every((value) => {
        if (!hasOnly(value, new Set(["observedAt", "usedPercent"]))) return false;
        const point = value as Record<string, unknown>;
        return typeof point.observedAt === "string" && Number.isFinite(Date.parse(point.observedAt))
          && Number.isFinite(point.usedPercent) && Number(point.usedPercent) >= 0 && Number(point.usedPercent) <= 100;
      });
  };
  const validUsage = (item: unknown) => {
    if (!hasOnly(item, usageKeys)) return false;
    const usage = item as Record<string, unknown>;
    return [...usageKeys].every((key) => key === "cacheWriteInputTokens" && !Object.hasOwn(usage, key) || Number.isFinite(usage[key]) && Number(usage[key]) >= 0);
  };
  const validSession = (item: unknown) => {
    if (!hasOnly(item, sessionKeys)) return false;
    const session = item as Record<string, unknown>;
    return typeof session.id === "string" && session.id.length > 0 && session.id.length <= 256
      && typeof session.title === "string" && session.title.length <= 300
      && (session.cwd === null || typeof session.cwd === "string")
      && (session.projectName == null || (typeof session.projectName === "string" && session.projectName.length <= 200))
      && (session.projectGitHubUrl == null || (typeof session.projectGitHubUrl === "string" && /^https:\/\/github\.com\/[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(session.projectGitHubUrl)))
      && validUsage(session.usage)
      && Array.isArray(session.calls) && session.calls.length <= 100000 && session.calls.every((call) => hasOnly(call, callKeys) && validUsage((call as Record<string, unknown>).usage))
      && Array.isArray(session.turns) && session.turns.length <= 100000 && session.turns.every((turn) => hasOnly(turn, turnKeys) && validUsage((turn as Record<string, unknown>).usage));
  };
  if (!hasOnly(payload, payloadKeys) || payload.kind !== "sync" || payload.snapshotVersion !== 1 || !Number.isFinite(Date.parse(String(payload.generatedAt)))) throw new Error("Charge utile Mesh invalide.");
  if (!Array.isArray(payload.upserts) || payload.upserts.length > 100 || !payload.upserts.every(validSession)) throw new Error("Lot de sessions Mesh invalide.");
  if (!Array.isArray(payload.removals) || payload.removals.length > 100 || !payload.removals.every((id) => typeof id === "string" && id.length <= 256) || payload.removals.length + payload.upserts.length > 100) throw new Error("Suppressions Mesh invalides.");
  const privacy = payload.privacy as Record<string, unknown>;
  if (!hasOnly(privacy, new Set(["projectMode", "includeTitles"])) || !["hash", "basename", "full"].includes(String(privacy.projectMode)) || typeof privacy.includeTitles !== "boolean") throw new Error("Profil de confidentialité invalide.");
  if (payload.quota != null && !validQuota(payload.quota)) throw new Error("Quota Mesh invalide.");
  if (payload.shortQuota != null && !validQuota(payload.shortQuota)) throw new Error("Quota court Mesh invalide.");
  if (payload.quotaHistory !== undefined && (!Array.isArray(payload.quotaHistory) || payload.quotaHistory.length > 500 || !payload.quotaHistory.every(validQuota))) throw new Error("Historique de quota Mesh invalide.");
}

export function validateReadPayload(value: unknown): asserts value is Record<string, unknown> & { kind: "read"; requestVersion: 1 } {
  const payload = value as Record<string, unknown>;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)
    || Object.keys(payload).some((key) => !["kind", "requestVersion"].includes(key))
    || payload.kind !== "read" || payload.requestVersion !== 1) {
    throw new Error("Demande de lecture Mesh invalide.");
  }
}

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "cache-control": "no-store", "x-content-type-options": "nosniff" } });
}
