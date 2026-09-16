import { createHash } from "node:crypto";
import { callFromRow, turnFromRow } from "./relational-reader.mjs";
import { transaction } from "./sqlite.mjs";

export const LOCAL_OWNER = "local";
export const LOCAL_NODE = "local";

export class LocalRepository {
  constructor(database) {
    this.database = database;
    this.raw = database.raw;
    this.upsert = this.raw
      .prepare(`INSERT INTO mesh_sessions(node_id,session_id,snapshot_json,updated_at,content_hash,relational_version)
      VALUES(?,?,?,?,?,2) ON CONFLICT(node_id,session_id) DO UPDATE SET snapshot_json=excluded.snapshot_json,
      updated_at=excluded.updated_at,content_hash=excluded.content_hash,relational_version=2
      WHERE mesh_sessions.content_hash IS NOT excluded.content_hash`);
    this.metadataGet = this.raw.prepare(
      "SELECT value FROM local_metadata WHERE key=?",
    );
    this.metadataPut = this.raw.prepare(
      "INSERT INTO local_metadata VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
    );
    this.readCalls = this.raw.prepare(
      "SELECT * FROM usage_calls WHERE node_id=? AND session_id=? ORDER BY ordinal",
    );
    this.readTurns = this.raw.prepare(
      "SELECT * FROM usage_turns WHERE node_id=? AND session_id=? ORDER BY ordinal",
    );
    this.readModels = this.raw.prepare(
      "SELECT model FROM usage_session_models WHERE node_id=? AND session_id=? ORDER BY model",
    );
    this.references = new Map();
  }

  getMetadata(key) {
    const row = this.metadataGet.get(key);
    return row ? JSON.parse(row.value) : null;
  }
  setMetadata(key, value) {
    this.metadataPut.run(key, JSON.stringify(value));
  }

  writeSession(node, session) {
    const snapshot = JSON.stringify({
      ...session,
      calls: session.calls || [],
      turns: session.turns || [],
    });
    const hash = createHash("sha256").update(snapshot).digest("hex");
    return this.upsert.run(
      node,
      session.id,
      snapshot,
      session.updatedAt || null,
      hash,
    ).changes;
  }

  readSession(row) {
    return {
      ...JSON.parse(row.snapshot_json),
      models: this.readModels
        .all(row.node_id, row.session_id)
        .map((row) => row.model),
      calls: this.readCalls.all(row.node_id, row.session_id).map(callFromRow),
      turns: this.readTurns.all(row.node_id, row.session_id).map(turnFromRow),
    };
  }
  sessions(node) {
    return this.raw
      .prepare(
        "SELECT * FROM mesh_sessions WHERE node_id=? ORDER BY updated_at DESC",
      )
      .all(node)
      .map((row) => this.readSession(row));
  }

  saveUsage(data, fingerprint, savedAt) {
    const nextReferences = new Map();
    transaction(this.raw, () => {
      this.raw
        .prepare(
          `INSERT OR IGNORE INTO mesh_nodes(id,owner_id,alias,public_key,fingerprint,enrolled_at,privacy_json)
        VALUES(?,?,?,?,?,?,?)`,
        )
        .run(
          LOCAL_NODE,
          LOCAL_OWNER,
          "Local",
          "",
          "local",
          data.generatedAt,
          "{}",
        );
      const existing = new Set(
        this.raw
          .prepare("SELECT session_id FROM mesh_sessions WHERE node_id=?")
          .all(LOCAL_NODE)
          .map((row) => row.session_id),
      );
      for (const session of data.sessions) {
        if (this.references.get(session.id) !== session)
          this.writeSession(LOCAL_NODE, session);
        existing.delete(session.id);
        nextReferences.set(session.id, session);
      }
      const remove = this.raw.prepare(
        "DELETE FROM mesh_sessions WHERE node_id=? AND session_id=?",
      );
      for (const id of existing) remove.run(LOCAL_NODE, id);
      const { sessions, ...metadata } = data;
      this.setMetadata("usage", {
        metadata,
        fingerprint,
        savedAt,
        revision: (this.getMetadata("usage")?.revision || 0) + 1,
      });
    });
    this.references = nextReferences;
  }

  loadUsage() {
    const value = this.getMetadata("usage");
    if (!value) return null;
    const sessions = this.sessions(LOCAL_NODE);
    this.references = new Map(sessions.map((session) => [session.id, session]));
    return { ...value, data: { ...value.metadata, sessions } };
  }

  metadata() {
    const stored = this.getMetadata("usage");
    if (!stored) return null;
    const row = this.raw
      .prepare(
        "SELECT COUNT(*) AS count, MIN(started_at) AS first FROM mesh_sessions WHERE node_id=?",
      )
      .get(LOCAL_NODE);
    return {
      ...stored.metadata,
      sessions: [],
      sessionCount: row.count,
      firstSessionAt: row.first,
      revision: stored.revision,
    };
  }
}
