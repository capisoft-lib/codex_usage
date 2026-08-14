import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { createPrivacySalt, sanitizeUsageForMesh, sessionHashes } from "./mesh-privacy.mjs";
import { canonicalJson, createSignedEnvelope, generateNodeIdentity, normalizeNodeAlias } from "./mesh-protocol.mjs";

const AGENT_STATE_VERSION = 1;
const DEFAULT_BATCH_SIZE = 25;

function createAgentState(alias) {
  const identity = generateNodeIdentity();
  return {
    version: AGENT_STATE_VERSION,
    alias,
    nodeId: null,
    sequence: 0,
    projectSalt: createPrivacySalt(),
    publicKey: identity.publicKey,
    privateKey: identity.privateKey,
    sessionHashes: {},
    lastSyncAt: null,
  };
}

async function responseJson(response) {
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
  if (!response.ok) {
    const error = new Error(body.error || `HTTP ${response.status}`);
    error.status = response.status;
    error.code = body.code;
    throw error;
  }
  return body;
}

export class MeshAgent {
  constructor({
    hubUrl,
    alias,
    statePath,
    enrollmentCode = null,
    projectMode = "hash",
    includeTitles = false,
    batchSize = DEFAULT_BATCH_SIZE,
    fetchImpl = fetch,
    logger = console,
  }) {
    if (!hubUrl) throw new Error("MESH_HUB_URL est requis pour activer l’agent Mesh.");
    this.hubUrl = String(hubUrl).replace(/\/+$/, "");
    this.alias = normalizeNodeAlias(alias);
    this.statePath = statePath;
    this.enrollmentCode = enrollmentCode;
    this.projectMode = projectMode;
    this.includeTitles = includeTitles;
    this.batchSize = Math.max(1, Math.min(100, Number(batchSize) || DEFAULT_BATCH_SIZE));
    this.fetch = fetchImpl;
    this.logger = logger;
    this.state = null;
    this.syncPromise = null;
  }

  async load() {
    try {
      const state = JSON.parse(await readFile(this.statePath, "utf8"));
      if (state.version !== AGENT_STATE_VERSION || !state.privateKey || !state.publicKey || !state.projectSalt) throw new Error("État incompatible");
      state.alias = this.alias;
      this.state = state;
    } catch (error) {
      if (error.code !== "ENOENT") throw new Error(`État de l’agent Mesh illisible : ${error.message}`);
      this.state = createAgentState(this.alias);
      await this.persist();
    }
    return this.state;
  }

  async persist() {
    await mkdir(path.dirname(this.statePath), { recursive: true });
    const temporaryPath = `${this.statePath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(this.state), { encoding: "utf8", mode: 0o600 });
    await rename(temporaryPath, this.statePath);
  }

  async enroll() {
    if (this.state.nodeId) return this.state.nodeId;
    if (!this.enrollmentCode) throw new Error("Cette machine n’est pas enrôlée : fournissez un code MESH_ENROLLMENT_CODE à usage unique.");
    const response = await this.fetch(`${this.hubUrl}/api/mesh/enroll`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: this.enrollmentCode, alias: this.alias, publicKey: this.state.publicKey }),
    });
    const result = await responseJson(response);
    this.state.nodeId = result.nodeId;
    this.state.sequence = 0;
    await this.persist();
    this.enrollmentCode = null;
    return this.state.nodeId;
  }

  sync(data) {
    if (this.syncPromise) return this.syncPromise;
    this.syncPromise = this.runSync(data).finally(() => { this.syncPromise = null; });
    return this.syncPromise;
  }

  async runSync(data) {
    if (!this.state) await this.load();
    await this.enroll();
    const sanitized = sanitizeUsageForMesh(data, {
      projectMode: this.projectMode,
      includeTitles: this.includeTitles,
      projectSalt: this.state.projectSalt,
    });
    const nextHashes = sessionHashes(sanitized.sessions);
    const upserts = sanitized.sessions.filter((session) => this.state.sessionHashes[session.id] !== nextHashes[session.id]);
    const removals = Object.keys(this.state.sessionHashes).filter((id) => !Object.hasOwn(nextHashes, id));
    const batches = [];
    let upsertIndex = 0;
    let removalIndex = 0;
    while (upsertIndex < upserts.length || removalIndex < removals.length) {
      const batchUpserts = upserts.slice(upsertIndex, upsertIndex + this.batchSize);
      upsertIndex += batchUpserts.length;
      const remainingSlots = this.batchSize - batchUpserts.length;
      const batchRemovals = removals.slice(removalIndex, removalIndex + remainingSlots);
      removalIndex += batchRemovals.length;
      batches.push({ upserts: batchUpserts, removals: batchRemovals });
    }
    if (batches.length === 0) batches.push({ upserts: [], removals });

    let accepted = 0;
    for (const batch of batches) {
      const payload = {
        kind: "sync",
        snapshotVersion: 1,
        analyzerVersion: sanitized.analyzerVersion,
        generatedAt: sanitized.generatedAt,
        privacy: sanitized.privacy,
        quota: sanitized.quota,
        upserts: batch.upserts,
        removals: batch.removals,
      };
      const sequence = this.state.sequence + 1;
      const envelope = createSignedEnvelope({
        nodeId: this.state.nodeId,
        sequence,
        payload,
        privateKey: this.state.privateKey,
      });
      const response = await this.fetch(`${this.hubUrl}/api/mesh/ingest`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: canonicalJson(envelope),
      });
      await responseJson(response);
      this.state.sequence = sequence;
      await this.persist();
      accepted += batch.upserts.length;
    }

    this.state.sessionHashes = nextHashes;
    this.state.lastSyncAt = new Date().toISOString();
    await this.persist();
    this.logger.log(`Mesh synchronisé : ${accepted} session(s) modifiée(s), ${removals.length} suppression(s).`);
    return { accepted, removed: removals.length, batches: batches.length, lastSyncAt: this.state.lastSyncAt };
  }

  status() {
    return {
      enabled: true,
      enrolled: Boolean(this.state?.nodeId),
      nodeId: this.state?.nodeId || null,
      alias: this.alias,
      hubUrl: this.hubUrl,
      syncing: Boolean(this.syncPromise),
      lastSyncAt: this.state?.lastSyncAt || null,
    };
  }
}
