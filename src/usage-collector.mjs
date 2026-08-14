import path from "node:path";
import { analyzeCodexUsage, usageFingerprint } from "./analyzer.mjs";
import { createDashboardCapabilities } from "./dashboard-contract.mjs";
import { MeshAgent } from "./mesh-agent.mjs";
import { serializePublicUsage, toPublicUsage } from "./public-usage.mjs";
import { UsageStore } from "./usage-store.mjs";

function serviceError(message, code, status = 503) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export class UsageCollector {
  constructor({ store, meshAgent = null }) {
    this.store = store;
    this.meshAgent = meshAgent;
  }

  start(options) {
    this.store.start(options);
  }

  stop() {
    this.store.stop();
  }

  refresh(force = false) {
    return this.store.refresh(force);
  }

  async localUsage(force = false) {
    return toPublicUsage(await this.store.getUsage(force));
  }

  localUsageJson(force = false) {
    return this.store.getSerializedUsage(force);
  }

  async centralizedUsage(force = false) {
    if (!this.meshAgent) {
      throw serviceError(
        "Le mode centralisé nécessite MESH_HUB_URL et une machine enrôlée.",
        "mesh_not_configured",
      );
    }
    if (force) {
      const data = await this.store.getUsage(true);
      await this.meshAgent.sync(data);
    }
    return toPublicUsage(await this.meshAgent.centralizedUsage());
  }

  capabilities() {
    const sources = this.meshAgent ? ["local", "centralized"] : ["local"];
    return createDashboardCapabilities({
      runtime: "local",
      sources,
      defaultSource: "local",
      canRefresh: true,
    });
  }

  status() {
    return {
      ...this.store.status(),
      mode: "local",
      mesh: this.meshAgent?.status() || { enabled: false },
    };
  }
}

export async function createUsageCollector({
  env = process.env,
  root,
  logger = console,
  analyze = (previousData) => analyzeCodexUsage({ previousData }),
  fingerprint = usageFingerprint,
  fetchImpl = fetch,
} = {}) {
  if (!root) throw new Error("Le dossier racine du collecteur est requis.");
  const refreshIntervalMs = Math.max(1_000, Number(env.REFRESH_INTERVAL_MS || 60_000));
  const snapshotPath = env.SNAPSHOT_PATH === ""
    ? null
    : env.SNAPSHOT_PATH || path.join(root, ".cache", "usage-snapshot.json");

  let meshAgent = null;
  if (env.MESH_HUB_URL) {
    meshAgent = new MeshAgent({
      hubUrl: env.MESH_HUB_URL,
      alias: env.MESH_NODE_ALIAS,
      statePath: env.MESH_AGENT_STATE_PATH || path.join(root, ".cache", "mesh-agent.json"),
      enrollmentCode: env.MESH_ENROLLMENT_CODE || null,
      sitesBypassToken: env.MESH_SITES_BYPASS_TOKEN || null,
      projectMode: env.MESH_PROJECT_MODE || "hash",
      includeTitles: env.MESH_INCLUDE_TITLES === "1" || env.MESH_INCLUDE_TITLES === "true",
      batchSize: env.MESH_BATCH_SIZE,
      fetchImpl,
      logger,
    });
    await meshAgent.load();
  }

  const store = new UsageStore({
    analyze,
    fingerprint,
    serialize: serializePublicUsage,
    snapshotPath,
    refreshIntervalMs,
    onUpdated: meshAgent ? (data) => meshAgent.sync(data) : null,
    logger,
  });
  await store.loadSnapshot();
  return new UsageCollector({ store, meshAgent });
}
