import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { cliText } from "./cli-locale.mjs";

const SNAPSHOT_VERSION = 1;

function validUsage(data) {
  return data && typeof data === "object" && Array.isArray(data.sessions) && typeof data.generatedAt === "string";
}

export class UsageStore {
  constructor({ analyze, fingerprint, enrich = null, serialize = JSON.stringify, snapshotPath = null, refreshIntervalMs = 15_000, onUpdated = null, logger = console }) {
    this.analyze = analyze;
    this.enrich = enrich;
    this.fingerprint = fingerprint;
    this.serialize = serialize;
    this.snapshotPath = snapshotPath;
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
    if (!this.snapshotPath) return false;
    try {
      const snapshot = JSON.parse(await readFile(this.snapshotPath, "utf8"));
      if (snapshot.version !== SNAPSHOT_VERSION || !validUsage(snapshot.data)) return false;
      this.cache = {
        data: snapshot.data,
        serialized: this.serialize(snapshot.data),
        fingerprint: snapshot.fingerprint || null,
      };
      this.lastSuccessAt = snapshot.savedAt || snapshot.data.generatedAt;
      return true;
    } catch (error) {
      if (error.code !== "ENOENT") this.logger.warn(cliText("snapshotIgnored", error.message));
      return false;
    }
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

  async persist() {
    if (!this.snapshotPath) return;
    await mkdir(path.dirname(this.snapshotPath), { recursive: true });
    const temporaryPath = `${this.snapshotPath}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify({
      version: SNAPSHOT_VERSION,
      savedAt: this.lastSuccessAt,
      fingerprint: this.cache.fingerprint,
      data: this.cache.data,
    }), "utf8");
    await rename(temporaryPath, this.snapshotPath);
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
      this.cache = {
        data,
        serialized: this.serialize(data),
        fingerprint: currentFingerprint,
      };
      this.lastSuccessAt = new Date().toISOString();
      this.lastError = null;
      await this.persist();
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
