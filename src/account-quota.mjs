import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { existsSync } from "node:fs";
import path from "node:path";
import { normalizeFiveHourQuota, normalizeWeeklyQuota } from "./analyzer.mjs";
import { mergeWeeklyQuotaObservations } from "./quota-history.mjs";

// Only derived quota fields leave the local Codex App Server. Never retain the
// account ID, credentials, credit IDs or descriptions from its response.
export function normalizeAccountQuotas(result, observedAt = new Date().toISOString()) {
  const limits = result?.rateLimitsByLimitId?.codex ?? result?.rateLimits;
  if (!limits || (limits.limitId && limits.limitId !== "codex")) return null;
  const count = result?.rateLimitResetCredits?.availableCount;
  const resets = Number.isSafeInteger(count) && count >= 0 ? count : undefined;
  const window = (value) => value && ({ used_percent: value.usedPercent,
    window_minutes: value.windowDurationMins, resets_at: value.resetsAt });
  const raw = { primary: window(limits.primary), secondary: window(limits.secondary),
    individual_limit: window(limits.individualLimit), plan_type: limits.planType,
    resets_available: resets };
  return { weeklyQuota: normalizeWeeklyQuota(raw, observedAt), fiveHourQuota: normalizeFiveHourQuota(raw, observedAt) };
}

export function codexExecutable(env = process.env) {
  if (env.CODEX_CLI_PATH) return env.CODEX_CLI_PATH;
  if (process.platform === "win32" && env.LOCALAPPDATA) {
    const desktop = path.join(env.LOCALAPPDATA, "Programs", "OpenAI", "Codex", "bin", "codex.exe");
    if (existsSync(desktop)) return desktop;
  }
  return "codex";
}

export function readAccountQuotas({ executable, timeoutMs = 15_000, spawnImpl = spawn, env = process.env } = {}) {
  return new Promise((resolve) => {
    let child, lines, timer, value = null, finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      lines?.close();
      resolve(value);
    };
    const stop = () => { child?.kill(); };
    try {
      child = spawnImpl(executable || codexExecutable(env), ["app-server", "--stdio"], {
        windowsHide: true, stdio: ["pipe", "pipe", "ignore"], env,
      });
      child.once("error", finish);
      child.once("close", finish);
      child.stdin.on("error", stop);
      timer = setTimeout(stop, timeoutMs);
      const send = (message) => child.stdin.write(`${JSON.stringify(message)}\n`);
      lines = createInterface({ input: child.stdout });
      let initialized = false;
      lines.on("line", (line) => {
        try {
          const message = JSON.parse(line);
          if (message.id === 1 && !initialized) {
            if (message.error) return stop();
            initialized = true;
            send({ method: "initialized" });
            send({ id: 2, method: "account/rateLimits/read" });
          } else if (message.id === 2 && initialized) {
            value = message.error ? null : normalizeAccountQuotas(message.result);
            stop();
          }
        } catch { /* Ignore non-protocol output; the deadline remains bounded. */ }
      });
      send({ id: 1, method: "initialize", params: {
        clientInfo: { name: "codex_usage_dashboard", version: "1.5.0" },
        capabilities: { experimentalApi: true },
      } });
    } catch { stop(); finish(); }
  });
}

export function applyAccountQuotas(data, account) {
  const live = account?.weeklyQuota;
  if (!live) {
    // A failed/unsupported read must not present an old credit count as current.
    const clear = (quota) => quota ? { ...quota, resetsAvailable: null } : quota;
    return { ...data, weeklyQuota: clear(data.weeklyQuota), fiveHourQuota: clear(data.fiveHourQuota),
      weeklyQuotaHistory: data.weeklyQuotaHistory?.map((q, index) => index === 0 ? clear(q) : q) };
  }
  const weeklyQuotaHistory = mergeWeeklyQuotaObservations([...(data.weeklyQuotaHistory || []), live]);
  return { ...data, weeklyQuota: weeklyQuotaHistory[0] || live, weeklyQuotaHistory,
    fiveHourQuota: account.fiveHourQuota || data.fiveHourQuota };
}
