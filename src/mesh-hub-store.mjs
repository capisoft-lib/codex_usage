import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  normalizeNodeAlias,
  publicKeyFingerprint,
  sha256,
  validateReadPayload,
  validateSyncPayload,
  verifySignedEnvelope,
} from "./mesh-protocol.mjs";

const STORE_VERSION = 1;

function emptyState() {
  return { version: STORE_VERSION, enrollments: {}, nodes: {} };
}

function httpError(message, status = 400, code = "mesh_invalid") {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

function latestQuota(nodes) {
  return Object.values(nodes)
    .filter((node) => node.quota)
    .map((node) => ({ ...node.quota, nodeId: node.id, nodeAlias: node.alias, receivedAt: node.lastSeen }))
    .sort((left, right) => String(right.observedAt || right.receivedAt).localeCompare(String(left.observedAt || left.receivedAt)))[0] || null;
}

export class MeshHubStore {
  constructor({ storePath = null, enrollmentTtlMs = 10 * 60 * 1_000, logger = console } = {}) {
    this.storePath = storePath;
    this.enrollmentTtlMs = enrollmentTtlMs;
    this.logger = logger;
    this.state = emptyState();
    this.writePromise = Promise.resolve();
  }

  async load() {
    if (!this.storePath) return false;
    try {
      const state = JSON.parse(await readFile(this.storePath, "utf8"));
      if (state.version !== STORE_VERSION || !state.nodes || !state.enrollments) return false;
      this.state = state;
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") this.logger.warn(`Stockage Mesh ignoré : ${error.message}`);
      return false;
    }
  }

  persist() {
    if (!this.storePath) return Promise.resolve();
    this.writePromise = this.writePromise.then(async () => {
      await mkdir(path.dirname(this.storePath), { recursive: true });
      const temporaryPath = `${this.storePath}.${process.pid}.tmp`;
      await writeFile(temporaryPath, JSON.stringify(this.state), "utf8");
      await rename(temporaryPath, this.storePath);
    });
    return this.writePromise;
  }

  async createEnrollment(now = Date.now()) {
    const raw = randomBytes(8).toString("hex").toUpperCase();
    const code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12)}`;
    const codeHash = sha256(code);
    const expiresAt = new Date(now + this.enrollmentTtlMs).toISOString();
    this.state.enrollments[codeHash] = { expiresAt, usedAt: null };
    await this.persist();
    return { code, expiresAt };
  }

  async enroll({ code, alias, publicKey }, now = Date.now()) {
    if (typeof code !== "string" || code.length > 128 || typeof publicKey !== "string" || publicKey.length > 4_096) {
      throw httpError("Demande d’enrôlement invalide.");
    }
    const enrollment = this.state.enrollments[sha256(code.trim().toUpperCase())];
    if (!enrollment || enrollment.usedAt || Date.parse(enrollment.expiresAt) < now) {
      throw httpError("Code d’enrôlement invalide ou expiré.", 401, "mesh_enrollment_invalid");
    }
    let fingerprint;
    try { fingerprint = publicKeyFingerprint(publicKey); } catch { throw httpError("Clé publique de machine invalide."); }
    const nodeId = `node_${fingerprint.slice(0, 20)}`;
    if (this.state.nodes[nodeId]) throw httpError("Cette machine est déjà enrôlée.", 409, "mesh_node_exists");
    enrollment.usedAt = new Date(now).toISOString();
    this.state.nodes[nodeId] = {
      id: nodeId,
      alias: normalizeNodeAlias(alias),
      publicKey,
      fingerprint,
      enrolledAt: new Date(now).toISOString(),
      lastSeen: null,
      lastGeneratedAt: null,
      lastSequence: 0,
      revokedAt: null,
      privacy: { projectMode: "hash", includeTitles: false },
      quota: null,
      sessions: {},
    };
    await this.persist();
    return { nodeId, alias: this.state.nodes[nodeId].alias };
  }

  async ingest(envelope, now = Date.now()) {
    const node = this.state.nodes[envelope?.nodeId];
    if (!node || node.revokedAt) throw httpError("Machine Mesh inconnue ou révoquée.", 401, "mesh_node_unknown");
    try { verifySignedEnvelope(envelope, node.publicKey, { now }); } catch (error) { throw httpError(error.message, 401, "mesh_signature_invalid"); }
    if (envelope.sequence <= node.lastSequence) throw httpError("Séquence Mesh déjà traitée.", 409, "mesh_replay");
    let payload;
    try { payload = validateSyncPayload(envelope.payload); } catch (error) { throw httpError(error.message); }

    for (const id of payload.removals) delete node.sessions[id];
    for (const session of payload.upserts) node.sessions[session.id] = session;
    node.lastSequence = envelope.sequence;
    node.lastSeen = new Date(now).toISOString();
    node.lastGeneratedAt = payload.generatedAt;
    node.analyzerVersion = payload.analyzerVersion;
    node.privacy = payload.privacy;
    if (payload.quota !== undefined) node.quota = payload.quota;
    await this.persist();
    return { accepted: true, sequence: node.lastSequence, sessions: Object.keys(node.sessions).length };
  }

  async readUsage(envelope, now = Date.now()) {
    const node = this.state.nodes[envelope?.nodeId];
    if (!node || node.revokedAt) throw httpError("Machine Mesh inconnue ou révoquée.", 401, "mesh_node_unknown");
    try { verifySignedEnvelope(envelope, node.publicKey, { now }); } catch (error) { throw httpError(error.message, 401, "mesh_signature_invalid"); }
    if (envelope.sequence <= node.lastSequence) throw httpError("Séquence Mesh déjà traitée.", 409, "mesh_replay");
    try { validateReadPayload(envelope.payload); } catch (error) { throw httpError(error.message); }
    node.lastSequence = envelope.sequence;
    node.lastSeen = new Date(now).toISOString();
    await this.persist();
    return this.aggregate();
  }

  async revokeNode(nodeId, now = Date.now()) {
    const node = this.state.nodes[nodeId];
    if (!node) throw httpError("Machine Mesh inconnue.", 404, "mesh_node_unknown");
    node.revokedAt = new Date(now).toISOString();
    await this.persist();
    return { nodeId, revokedAt: node.revokedAt };
  }

  nodes() {
    return Object.values(this.state.nodes).map((node) => ({
      id: node.id,
      alias: node.alias,
      enrolledAt: node.enrolledAt,
      lastSeen: node.lastSeen,
      lastGeneratedAt: node.lastGeneratedAt,
      revokedAt: node.revokedAt,
      privacy: node.privacy,
      sessionCount: Object.keys(node.sessions).length,
    }));
  }

  aggregate() {
    const active = Object.values(this.state.nodes).filter((node) => !node.revokedAt);
    const sessions = active.flatMap((node) => Object.values(node.sessions).map((session) => ({
      ...session,
      id: `${node.id}:${session.id}`,
      sourceSessionId: session.id,
      nodeId: node.id,
      nodeAlias: node.alias,
    })));
    return {
      analyzerVersion: Math.max(0, ...active.map((node) => Number(node.analyzerVersion) || 0)),
      generatedAt: new Date().toISOString(),
      source: { mode: "mesh", sessionsAvailable: active.length > 0, archivedSessionsAvailable: false, sessionIndexAvailable: false },
      weeklyQuota: latestQuota(this.state.nodes),
      nodes: this.nodes(),
      sessions: sessions.sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt))),
      errorCount: 0,
    };
  }
}
