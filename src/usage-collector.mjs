import path from "node:path";
import { analyzeCodexUsage, usageFingerprint } from "./analyzer.mjs";
import { createDashboardCapabilities } from "./dashboard-contract.mjs";
import { MeshAgent, readPersistedMeshHubUrl } from "./mesh-agent.mjs";
import { serializePublicUsage, toPublicUsage } from "./public-usage.mjs";
import { UsageStore } from "./usage-store.mjs";
import { applyAccountQuotas, readAccountQuotas } from "./account-quota.mjs";

const defaultAnalyze = (previousData) => analyzeCodexUsage({ previousData });

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
  analyze = defaultAnalyze,
  accountQuotaReader,
  fingerprint = usageFingerprint,
  fetchImpl = fetch,
} = {}) {
  if (!root) throw new Error("Le dossier racine du collecteur est requis.");
  const refreshIntervalMs = Math.max(1_000, Number(env.REFRESH_INTERVAL_MS || 60_000));
  const snapshotPath = env.SNAPSHOT_PATH === ""
    ? null
    : env.SNAPSHOT_PATH || path.join(root, ".cache", "usage-snapshot.json");

  const meshAgentStatePath = env.MESH_AGENT_STATE_PATH || path.join(root, ".cache", "mesh-agent.json");
  const meshHubUrl = env.MESH_HUB_URL || await readPersistedMeshHubUrl(meshAgentStatePath);
  let meshAgent = null;
  if (meshHubUrl) {
    meshAgent = new MeshAgent({
      hubUrl: meshHubUrl,
      alias: env.MESH_NODE_ALIAS,
      statePath: meshAgentStatePath,
      enrollmentCode: env.MESH_ENROLLMENT_CODE || null,
      projectMode: env.MESH_PROJECT_MODE || "hash",
      includeTitles: env.MESH_INCLUDE_TITLES === "1" || env.MESH_INCLUDE_TITLES === "true",
      batchSize: env.MESH_BATCH_SIZE,
      fetchImpl,
      logger,
    });
    await meshAgent.load();
  }

  const quotaReader = accountQuotaReader || (analyze === defaultAnalyze
    ? () => readAccountQuotas({ executable: env.CODEX_CLI_PATH, env: { ...process.env, ...env } })
    : null);
  const store = new UsageStore({
    analyze,
    enrich: env.CODEX_ACCOUNT_QUOTA_MODE !== "off" && quotaReader
      ? async (data) => applyAccountQuotas(data, await quotaReader()) : null,
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
