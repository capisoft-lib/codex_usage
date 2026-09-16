import { readFile } from "node:fs/promises";
import { openSqlite, sqlitePath } from './storage/sqlite.mjs';
import { LocalRepository } from './storage/local-repository.mjs';
import { cliText } from "./cli-locale.mjs";

const SNAPSHOT_VERSION = 1;

function validUsage(data) {
  return data && typeof data === "object" && Array.isArray(data.sessions) && typeof data.generatedAt === "string";
}

export class UsageStore {
  constructor({ analyze, fingerprint, enrich = null, serialize = JSON.stringify, snapshotPath = null, databasePath = undefined, refreshIntervalMs = 15_000, onUpdated = null, logger = console }) {
    this.analyze = analyze;
    this.enrich = enrich;
    this.fingerprint = fingerprint;
    this.serialize = serialize;
    this.snapshotPath = snapshotPath;
    this.databasePath = databasePath ?? sqlitePath(snapshotPath);
    this.database = openSqlite(this.databasePath);
    this.repository = new LocalRepository(this.database);
    this.refreshIntervalMs = refreshIntervalMs;
    this.onUpdated = onUpdated;
    this.logger = logger;
    this.cache = { data: null, serialized: null, fingerprint: null };
    this.refreshPromise = null;
    this.timer = null;
    this.lastAttemptAt = null;
    this.lastSuccessAt = null;
    this.lastError = null;
  }

  async loadSnapshot() {
    const stored = this.repository.loadUsage();
    if (stored) {
      this.cache = { data: stored.data, serialized: null, fingerprint: stored.fingerprint };
      this.lastSuccessAt = stored.savedAt;
      return true;
    }
    if (!this.snapshotPath || this.snapshotPath === this.databasePath) return false;
    let snapshot;
    try {
      snapshot = JSON.parse(await readFile(this.snapshotPath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") this.logger.warn(cliText("snapshotIgnored", error.message));
      return false;
    }
    if (snapshot.version !== SNAPSHOT_VERSION || !validUsage(snapshot.data)) return false;
    const savedAt = snapshot.savedAt || snapshot.data.generatedAt;
    this.repository.saveUsage(snapshot.data,snapshot.fingerprint || null,savedAt);
    this.cache = { data:snapshot.data,serialized:null,fingerprint:snapshot.fingerprint || null };
    this.lastSuccessAt = savedAt;
    return true;
  }

  start({ unrefTimer = true } = {}) {
    if (this.timer) return;
    void this.refresh().catch(() => {});
    if (this.refreshIntervalMs > 0) {
      this.timer = setInterval(() => void this.refresh().catch(() => {}), this.refreshIntervalMs);
      if (unrefTimer) this.timer.unref?.();
    }
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async close() {
    this.stop();
    await this.refreshPromise;
    this.database.close();
  }

  async persist() {
    this.repository.saveUsage(this.cache.data, this.cache.fingerprint, this.lastSuccessAt);
  }

  refresh(force = false) {
    if (this.refreshPromise) {
      return force ? this.refreshPromise.then(() => this.refresh(true)) : this.refreshPromise;
    }
    this.refreshPromise = this.runRefresh(force).finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async runRefresh(force) {
    const startedAt = Date.now();
    this.lastAttemptAt = new Date(startedAt).toISOString();
    try {
      const currentFingerprint = await this.fingerprint();
      const unchanged = !force && this.cache.data && currentFingerprint === this.cache.fingerprint;
      if (unchanged && !this.enrich) {
        this.lastError = null;
        if (this.onUpdated) {
          Promise.resolve(this.onUpdated(this.cache.data)).catch((error) => this.logger.warn(cliText("secondarySyncFailed", error.message)));
        }
        return this.cache.data;
      }

      let data = unchanged ? this.cache.data : await this.analyze(this.cache.data);
      if (this.enrich) data = await this.enrich(data);
      const savedAt = new Date().toISOString();
      this.repository.saveUsage(data,currentFingerprint,savedAt);
      this.cache = {
        data,
        serialized: null,
        fingerprint: currentFingerprint,
      };
      this.lastSuccessAt = savedAt;
      this.lastError = null;
      if (this.onUpdated) {
        Promise.resolve(this.onUpdated(data)).catch((error) => this.logger.warn(cliText("secondarySyncFailed", error.message)));
      }
      this.logger.log(cliText("refreshed", Date.now() - startedAt, data.sessions.length));
      return data;
    } catch (error) {
      this.lastError = error.message;
      this.logger.error(cliText("refreshFailed", error.message));
      if (this.cache.data) return this.cache.data;
      throw error;
    }
  }

  async getUsage(force = false) {
    if (force || !this.cache.data) await this.refresh(force);
    return this.cache.data;
  }

  async getSerializedUsage(force = false) {
    await this.getUsage(force);
    this.cache.serialized ??= this.serialize(this.cache.data);
    return this.cache.serialized;
  }

  status() {
    return {
      ok: true,
      ready: Boolean(this.cache.data),
      refreshing: Boolean(this.refreshPromise),
      generatedAt: this.cache.data?.generatedAt || null,
      lastAttemptAt: this.lastAttemptAt,
      lastSuccessAt: this.lastSuccessAt,
      lastError: this.lastError,
      refreshIntervalMs: this.refreshIntervalMs,
    };
  }
}
