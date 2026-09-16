import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { normalizeQuotaPeriods } from "../public/quota-periods.js";
import {
  normalizeNodeAlias,
  publicKeyFingerprint,
  sha256,
  validateReadPayload,
  validateSyncPayload,
  verifySignedEnvelope,
} from "./mesh-protocol.mjs";
import { openSqlite, sqlitePath, transaction } from "./storage/sqlite.mjs";
import { LocalRepository, LOCAL_OWNER } from "./storage/local-repository.mjs";

function httpError(message, status = 400, code = "mesh_invalid") {
  return Object.assign(new Error(message), { status, code });
}
const parsed = (value) => (value == null ? null : JSON.parse(value));
function nodeFromRow(row) {
  return {
    id: row.id,
    alias: row.alias,
    publicKey: row.public_key,
    fingerprint: row.fingerprint,
    enrolledAt: row.enrolled_at,
    lastSeen: row.last_seen,
    lastGeneratedAt: row.last_generated_at,
    lastSequence: row.last_sequence,
    revokedAt: row.revoked_at,
    analyzerVersion: row.analyzer_version,
    privacy: parsed(row.privacy_json),
    shortQuota: parsed(row.short_quota_json),
    quota: parsed(row.quota_json),
    quotaHistory: parsed(row.quota_history_json) || [],
  };
}

export class MeshHubStore {
  constructor({
    storePath = null,
    databasePath = undefined,
    enrollmentTtlMs = 600_000,
    logger = console,
  } = {}) {
    this.storePath = storePath;
    this.databasePath = databasePath ?? sqlitePath(storePath);
    this.database = openSqlite(this.databasePath);
    this.raw = this.database.raw;
    this.repository = new LocalRepository(this.database);
    this.enrollmentTtlMs = enrollmentTtlMs;
    this.logger = logger;
  }

  async load() {
    if (this.repository.getMetadata("mesh-imported")) return true;
    if (!this.storePath || this.storePath === this.databasePath) return false;
    let state;
    try {
      state = JSON.parse(await readFile(this.storePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    if (state.version !== 1 || !state.nodes || !state.enrollments)
      throw new Error("Invalid legacy Mesh database");
    // The original JSON remains untouched. The marker and every imported row
    // commit together, so a failed/interrupted import can safely restart.
    transaction(this.raw, () => {
      if (this.repository.getMetadata("mesh-imported")) return;
      for (const [hash, item] of Object.entries(state.enrollments)) {
        this.raw
          .prepare("INSERT OR IGNORE INTO mesh_enrollments VALUES(?,?,?,?,?)")
          .run(
            hash,
            LOCAL_OWNER,
            item.expiresAt,
            item.usedAt,
            new Date().toISOString(),
          );
      }
      for (const node of Object.values(state.nodes)) {
        // Never overwrite an identity or replay counter already in SQLite.
        if (this.getNode(node.id)) continue;
        this.insertNode(node);
        for (const session of Object.values(node.sessions || {}))
          this.repository.writeSession(node.id, session);
      }
      this.repository.setMetadata("mesh-imported", true);
    });
    return true;
  }

  insertNode(node) {
    this.raw
      .prepare(
        `INSERT INTO mesh_nodes(id,owner_id,alias,public_key,fingerprint,enrolled_at,last_seen,last_generated_at,
      last_sequence,revoked_at,privacy_json,short_quota_json,quota_json,quota_history_json,analyzer_version)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        node.id,
        LOCAL_OWNER,
        node.alias,
        node.publicKey,
        node.fingerprint,
        node.enrolledAt,
        node.lastSeen ?? null,
        node.lastGeneratedAt ?? null,
        node.lastSequence || 0,
        node.revokedAt ?? null,
        JSON.stringify(node.privacy || {}),
        JSON.stringify(node.shortQuota ?? null),
        JSON.stringify(node.quota ?? null),
        JSON.stringify(node.quotaHistory || []),
        node.analyzerVersion || 0,
      );
  }
  getNode(id) {
    const row = this.raw
      .prepare("SELECT * FROM mesh_nodes WHERE id=? AND owner_id=?")
      .get(id, LOCAL_OWNER);
    return row ? nodeFromRow(row) : null;
  }
  // Compatibility for callers inspecting state; persistence never uses this view.
  get state() {
    return {
      version: 1,
      nodes: Object.fromEntries(
        this.raw
          .prepare("SELECT * FROM mesh_nodes")
          .all()
          .map((row) => {
            const node = nodeFromRow(row);
            return [
              node.id,
              {
                ...node,
                sessions: Object.fromEntries(
                  this.repository.sessions(node.id).map((s) => [s.id, s]),
                ),
              },
            ];
          }),
      ),
      enrollments: Object.fromEntries(
        this.raw
          .prepare("SELECT * FROM mesh_enrollments")
          .all()
          .map((row) => [
            row.code_hash,
            { expiresAt: row.expires_at, usedAt: row.used_at },
          ]),
      ),
    };
  }

  async createEnrollment(now = Date.now()) {
    const code = randomBytes(16)
      .toString("hex")
      .toUpperCase()
      .match(/.{4}/g)
      .join("-");
    const expiresAt = new Date(now + this.enrollmentTtlMs).toISOString();
    this.raw
      .prepare("INSERT INTO mesh_enrollments VALUES(?,?,?,?,?)")
      .run(
        sha256(code),
        LOCAL_OWNER,
        expiresAt,
        null,
        new Date(now).toISOString(),
      );
    return { code, expiresAt };
  }

  async enroll({ code, alias, publicKey }, now = Date.now()) {
    if (
      typeof code !== "string" ||
      code.length > 128 ||
      typeof publicKey !== "string" ||
      publicKey.length > 4096
    )
      throw httpError("Demande d’enrôlement invalide.");
    return transaction(this.raw, () => {
      const hash = sha256(code.trim().toUpperCase());
      const enrollment = this.raw
        .prepare("SELECT * FROM mesh_enrollments WHERE code_hash=?")
        .get(hash);
      if (
        !enrollment ||
        enrollment.used_at ||
        Date.parse(enrollment.expires_at) < now
      )
        throw httpError(
          "Code d’enrôlement invalide ou expiré.",
          401,
          "mesh_enrollment_invalid",
        );
      let fingerprint;
      try {
        fingerprint = publicKeyFingerprint(publicKey);
      } catch {
        throw httpError("Clé publique de machine invalide.");
      }
      const nodeId = `node_${fingerprint.slice(0, 20)}`;
      if (this.getNode(nodeId))
        throw httpError(
          "Cette machine est déjà enrôlée.",
          409,
          "mesh_node_exists",
        );
      const node = {
        id: nodeId,
        alias: normalizeNodeAlias(alias),
        publicKey,
        fingerprint,
        enrolledAt: new Date(now).toISOString(),
        privacy: { projectMode: "hash", includeTitles: false },
      };
      this.insertNode(node);
      this.raw
        .prepare("UPDATE mesh_enrollments SET used_at=? WHERE code_hash=?")
        .run(node.enrolledAt, hash);
      return { nodeId, alias: node.alias };
    });
  }

  verifiedNode(envelope, now) {
    const node =
      typeof envelope?.nodeId === "string"
        ? this.getNode(envelope.nodeId)
        : null;
    if (!node || node.revokedAt)
      throw httpError(
        "Machine Mesh inconnue ou révoquée.",
        401,
        "mesh_node_unknown",
      );
    try {
      verifySignedEnvelope(envelope, node.publicKey, { now });
    } catch (error) {
      throw httpError(error.message, 401, "mesh_signature_invalid");
    }
    if (envelope.sequence <= node.lastSequence)
      throw httpError("Séquence Mesh déjà traitée.", 409, "mesh_replay");
    return node;
  }

  async ingest(envelope, now = Date.now()) {
    return transaction(this.raw, () => {
      const node = this.verifiedNode(envelope, now);
      let payload;
      try {
        payload = validateSyncPayload(envelope.payload);
      } catch (error) {
        throw httpError(error.message);
      }
      for (const id of payload.removals)
        this.raw
          .prepare("DELETE FROM mesh_sessions WHERE node_id=? AND session_id=?")
          .run(node.id, id);
      for (const session of payload.upserts)
        this.repository.writeSession(node.id, session);
      this.raw
        .prepare(
          `UPDATE mesh_nodes SET last_sequence=?,last_seen=?,last_generated_at=?,analyzer_version=?,privacy_json=?,
        short_quota_json=?,quota_json=?,quota_history_json=?,last_payload_hash=? WHERE id=?`,
        )
        .run(
          envelope.sequence,
          new Date(now).toISOString(),
          payload.generatedAt,
          payload.analyzerVersion,
          JSON.stringify(payload.privacy),
          JSON.stringify(
            payload.shortQuota === undefined
              ? node.shortQuota
              : payload.shortQuota,
          ),
          JSON.stringify(
            payload.quota === undefined ? node.quota : payload.quota,
          ),
          JSON.stringify(
            payload.quotaHistory === undefined
              ? node.quotaHistory
              : payload.quotaHistory,
          ),
          envelope.payloadHash,
          node.id,
        );
      return {
        accepted: true,
        sequence: envelope.sequence,
        sessions: this.raw
          .prepare(
            "SELECT COUNT(*) AS count FROM mesh_sessions WHERE node_id=?",
          )
          .get(node.id).count,
      };
    });
  }

  async readUsage(envelope, now = Date.now()) {
    transaction(this.raw, () => {
      const node = this.verifiedNode(envelope, now);
      try {
        validateReadPayload(envelope.payload);
      } catch (error) {
        throw httpError(error.message);
      }
      this.raw
        .prepare("UPDATE mesh_nodes SET last_sequence=?,last_seen=? WHERE id=?")
        .run(envelope.sequence, new Date(now).toISOString(), node.id);
    });
    return this.aggregate();
  }
  async revokeNode(id, now = Date.now()) {
    if (!this.getNode(id))
      throw httpError("Machine Mesh inconnue.", 404, "mesh_node_unknown");
    const revokedAt = new Date(now).toISOString();
    this.raw
      .prepare("UPDATE mesh_nodes SET revoked_at=? WHERE id=?")
      .run(revokedAt, id);
    return { nodeId: id, revokedAt };
  }
  nodes() {
    return this.raw
      .prepare(
        `SELECT n.*,COUNT(s.session_id) AS session_count FROM mesh_nodes n LEFT JOIN mesh_sessions s ON s.node_id=n.id
      WHERE n.owner_id=? GROUP BY n.id`,
      )
      .all(LOCAL_OWNER)
      .map((row) => ({
        id: row.id,
        alias: row.alias,
        enrolledAt: row.enrolled_at,
        lastSeen: row.last_seen,
        lastGeneratedAt: row.last_generated_at,
        revokedAt: row.revoked_at,
        privacy: parsed(row.privacy_json),
        sessionCount: row.session_count,
      }));
  }
  metadata() {
    const nodes = this.raw
      .prepare(
        "SELECT * FROM mesh_nodes WHERE owner_id=? AND revoked_at IS NULL",
      )
      .all(LOCAL_OWNER)
      .map(nodeFromRow);
    const quotas = (key) =>
      nodes
        .flatMap((node) =>
          (Array.isArray(node[key])
            ? node[key]
            : node[key]
              ? [node[key]]
              : []
          ).map((q) => ({
            ...q,
            nodeId: node.id,
            nodeAlias: node.alias,
            receivedAt: node.lastSeen,
          })),
        )
        .sort((a, b) =>
          String(b.observedAt || b.receivedAt).localeCompare(
            String(a.observedAt || a.receivedAt),
          ),
        );
    const weeklyQuotaHistory = normalizeQuotaPeriods({
      weeklyQuotaHistory: quotas("quotaHistory"),
      weeklyQuota: quotas("quota")[0],
    });
    const count = this.raw
      .prepare(
        `SELECT COUNT(*) AS count,MIN(s.started_at) AS first FROM mesh_sessions s JOIN mesh_nodes n ON n.id=s.node_id WHERE n.owner_id=? AND n.revoked_at IS NULL`,
      )
      .get(LOCAL_OWNER);
    return {
      analyzerVersion: Math.max(0, ...nodes.map((n) => n.analyzerVersion || 0)),
      generatedAt:
        nodes
          .map((n) => n.lastGeneratedAt || n.enrolledAt)
          .sort()
          .at(-1) || "1970-01-01T00:00:00.000Z",
      source: {
        mode: "mesh",
        sessionsAvailable: nodes.length > 0,
        archivedSessionsAvailable: false,
        sessionIndexAvailable: false,
      },
      fiveHourQuota: quotas("shortQuota")[0] || null,
      weeklyQuota: weeklyQuotaHistory[0] || quotas("quota")[0] || null,
      weeklyQuotaHistory,
      nodes: this.nodes(),
      sessions: [],
      sessionCount: count.count,
      firstSessionAt: count.first,
      errorCount: 0,
      revision: sha256(
        JSON.stringify(
          this.raw
            .prepare(
              "SELECT id,last_payload_hash,revoked_at FROM mesh_nodes WHERE owner_id=? ORDER BY id",
            )
            .all(LOCAL_OWNER),
        ),
      ),
    };
  }
  aggregate() {
    const metadata = this.metadata();
    const sessions = metadata.nodes
      .filter((n) => !n.revokedAt)
      .flatMap((node) =>
        this.repository
          .sessions(node.id)
          .map((session) => ({
            ...session,
            id: `${node.id}:${session.id}`,
            sourceSessionId: session.id,
            nodeId: node.id,
            nodeAlias: node.alias,
          })),
      );
    return {
      ...metadata,
      sessions: sessions.sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      ),
    };
  }
  close() {
    this.database.close();
  }
}
