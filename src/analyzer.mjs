import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";
import { mergeWeeklyQuotaObservations } from "./quota-history.mjs";

const EMPTY_USAGE = Object.freeze({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

export const ANALYZER_VERSION = 6;

function projectNameFromCwd(value) {
  const name = String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop()?.trim();
  return name ? name.slice(0, 200) : null;
}

export function normalizeGitHubRepositoryUrl(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;

  let pathname = null;
  const scp = raw.match(/^(?:git@)?github\.com:([^/?#]+)\/([^/?#]+?)\/?$/i);
  if (scp) pathname = `${scp[1]}/${scp[2]}`;
  else {
    try {
      const url = new URL(raw);
      if (url.hostname.toLowerCase() !== "github.com") return null;
      pathname = url.pathname.replace(/^\/+|\/+$/g, "");
    } catch {
      return null;
    }
  }

  const parts = String(pathname).split("/");
  if (parts.length !== 2) return null;
  const owner = parts[0].trim();
  const repository = parts[1].replace(/\.git$/i, "").trim();
  if (!owner || !repository || !/^[a-z0-9_.-]+$/i.test(owner) || !/^[a-z0-9_.-]+$/i.test(repository)) return null;
  return `https://github.com/${owner.toLowerCase()}/${repository.toLowerCase()}`;
}

export function resolveCodexSource(options = {}) {
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(homedir(), ".codex");
  const explicitlyScoped = Boolean(
    options.sessionsPath
    || options.archivedSessionsPath
    || options.sessionIndexPath
    || process.env.CODEX_SESSIONS_PATH
    || process.env.CODEX_ARCHIVED_SESSIONS_PATH
    || process.env.CODEX_SESSION_INDEX_PATH
  );
  return {
    mode: options.mode || process.env.CODEX_SOURCE_MODE || (explicitlyScoped ? "scoped" : "local"),
    sessionsPath: options.sessionsPath || process.env.CODEX_SESSIONS_PATH || path.join(codexHome, "sessions"),
    archivedSessionsPath: options.archivedSessionsPath || process.env.CODEX_ARCHIVED_SESSIONS_PATH || path.join(codexHome, "archived_sessions"),
    sessionIndexPath: options.sessionIndexPath || process.env.CODEX_SESSION_INDEX_PATH || path.join(codexHome, "session_index.jsonl"),
  };
}

async function sourcePathAvailable(filePath, kind) {
  try {
    const info = await stat(filePath);
    return kind === "directory" ? info.isDirectory() : info.isFile();
  } catch (error) {
    if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) return false;
    throw error;
  }
}

export async function inspectCodexSource(options = {}) {
  const source = resolveCodexSource(options);
  const [sessionsAvailable, archivedSessionsAvailable, sessionIndexAvailable] = await Promise.all([
    sourcePathAvailable(source.sessionsPath, "directory"),
    sourcePathAvailable(source.archivedSessionsPath, "directory"),
    sourcePathAvailable(source.sessionIndexPath, "file"),
  ]);
  return {
    mode: source.mode,
    sessionsAvailable,
    archivedSessionsAvailable,
    sessionIndexAvailable,
  };
}

function assertUsableSource(status) {
  if (status.sessionsAvailable || status.archivedSessionsAvailable) return;
  const error = new Error("Aucun dossier de sessions Codex lisible. Vérifiez la configuration de la source.");
  error.code = "CODEX_SOURCE_UNAVAILABLE";
  throw error;
}

function number(value) {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

export function normalizeUsage(raw = {}) {
  return {
    inputTokens: number(raw.input_tokens),
    cachedInputTokens: number(raw.cached_input_tokens),
    outputTokens: number(raw.output_tokens),
    reasoningOutputTokens: number(raw.reasoning_output_tokens),
    totalTokens: number(raw.total_tokens),
  };
}

export function addUsage(left = EMPTY_USAGE, right = EMPTY_USAGE) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    cachedInputTokens: left.cachedInputTokens + right.cachedInputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    reasoningOutputTokens: left.reasoningOutputTokens + right.reasoningOutputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  };
}

function optionalNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resetDate(value) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1_000 : numeric)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function normalizeWeeklyQuota(raw, observedAt = null) {
  if (!raw || typeof raw !== "object") return null;
  const windows = [raw.primary, raw.secondary, raw.individual_limit]
    .filter((window) => window && typeof window === "object")
    .map((window) => ({ ...window, windowMinutes: optionalNumber(window.window_minutes) }))
    .filter((window) => window.windowMinutes === 7 * 24 * 60);
  const weekly = windows[0];
  if (!weekly) return null;
  const usedPercent = optionalNumber(weekly.used_percent);
  const resetsAvailable = optionalNumber(
    weekly.resets_available
    ?? weekly.resets_remaining
    ?? raw.resets_available
    ?? raw.resets_remaining,
  );
  return {
    usedPercent: usedPercent === null ? null : Math.min(100, Math.max(0, usedPercent)),
    remainingPercent: usedPercent === null ? null : Math.min(100, Math.max(0, 100 - usedPercent)),
    windowMinutes: weekly.windowMinutes,
    resetsAt: resetDate(weekly.resets_at),
    resetsAvailable: resetsAvailable === null ? null : Math.max(0, resetsAvailable),
    observedAt: resetDate(observedAt),
    planType: raw.plan_type || null,
  };
}

async function walkJsonl(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) return;
      throw error;
    }
    await Promise.all(entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(fullPath);
    }));
  }
  await walk(root);
  return files;
}

export async function loadThreadNames(codexHome, sessionIndexPath = path.join(codexHome, "session_index.jsonl")) {
  const names = new Map();
  try {
    const content = await readFile(sessionIndexPath, "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.id && row.thread_name) names.set(row.id, row.thread_name);
      } catch { /* Ignore a partially written index line. */ }
    }
  } catch (error) {
    if (!["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) throw error;
  }
  return names;
}

function createTurn(id, timestamp, model, effort, serviceTier) {
  return {
    id,
    startedAt: timestamp,
    completedAt: null,
    durationMs: null,
    model: model || "unknown",
    effort: effort || null,
    serviceTier: serviceTier || "default",
    calls: 0,
    usage: { ...EMPTY_USAGE },
  };
}

export async function parseSessionFile(filePath, threadNames = new Map()) {
  let meta = null;
  let firstTimestamp = null;
  let lastTimestamp = null;
  let currentTurnId = null;
  let currentModel = "unknown";
  let currentEffort = null;
  let currentServiceTier = "default";
  let userMessages = 0;
  let assistantMessages = 0;
  let weeklyQuota = null;
  const weeklyQuotaObservations = [];
  const turns = new Map();
  const calls = [];
  const parseErrors = [];

  const input = createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let lineNumber = 0;

  try {
    for await (const line of lines) {
      lineNumber += 1;
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch {
        parseErrors.push(lineNumber);
        continue;
      }

      const timestamp = row.timestamp || null;
      if (timestamp) {
        if (!firstTimestamp || timestamp < firstTimestamp) firstTimestamp = timestamp;
        if (!lastTimestamp || timestamp > lastTimestamp) lastTimestamp = timestamp;
      }

      if (row.type === "session_meta") {
        meta = row.payload || {};
        continue;
      }

      if (row.type === "turn_context") {
        const payload = row.payload || {};
        currentTurnId = payload.turn_id || currentTurnId;
        currentModel = payload.model || currentModel;
        currentEffort = payload.effort || currentEffort;
        currentServiceTier = payload.service_tier || currentServiceTier;
        const turn = turns.get(currentTurnId);
        if (turn) {
          turn.model = currentModel;
          turn.effort = currentEffort;
          turn.serviceTier = currentServiceTier;
        }
        continue;
      }

      if (row.type !== "event_msg") continue;
      const payload = row.payload || {};
      const observedQuota = normalizeWeeklyQuota(payload.rate_limits || payload.info?.rate_limits, timestamp);
      if (observedQuota) {
        weeklyQuota = observedQuota;
        weeklyQuotaObservations.push(observedQuota);
      }

      if (payload.type === "thread_settings_applied") {
        currentServiceTier = payload.thread_settings?.service_tier || currentServiceTier;
        const turn = currentTurnId ? turns.get(currentTurnId) : null;
        if (turn && turn.calls === 0) turn.serviceTier = currentServiceTier;
      } else if (payload.type === "task_started") {
        currentTurnId = payload.turn_id || `turn-${turns.size + 1}`;
        if (!turns.has(currentTurnId)) {
          // `started_at` has existed both as Unix seconds and ISO text. The event
          // timestamp is stable across the observed formats and is preferable.
          turns.set(currentTurnId, createTurn(currentTurnId, timestamp || payload.started_at, currentModel, currentEffort, currentServiceTier));
        }
      } else if (payload.type === "user_message") {
        userMessages += 1;
      } else if (payload.type === "agent_message") {
        assistantMessages += 1;
      } else if (payload.type === "token_count" && payload.info?.last_token_usage) {
        const usage = normalizeUsage(payload.info.last_token_usage);
        const turn = currentTurnId ? turns.get(currentTurnId) : null;
        const model = turn?.model || currentModel || "unknown";
        calls.push({
          timestamp,
          turnId: currentTurnId,
          model,
          effort: turn?.effort || currentEffort || null,
          serviceTier: turn?.serviceTier || currentServiceTier || "default",
          usage,
        });
        if (turn) {
          turn.calls += 1;
          turn.usage = addUsage(turn.usage, usage);
        }
      } else if (payload.type === "task_complete") {
        const id = payload.turn_id || currentTurnId;
        const turn = turns.get(id);
        if (turn) {
          turn.completedAt = timestamp;
          const start = Date.parse(turn.startedAt);
          const end = Date.parse(timestamp);
          if (Number.isFinite(start) && Number.isFinite(end)) turn.durationMs = Math.max(0, end - start);
        }
        if (id === currentTurnId) currentTurnId = null;
      }
    }
  } catch (error) {
    if (error.code !== "EBUSY" && error.code !== "EPERM") throw error;
  }

  const sessionId = meta?.id || meta?.session_id || path.basename(filePath, ".jsonl");
  const turnList = [...turns.values()];
  const models = [...new Set(calls.map((call) => call.model).filter(Boolean))];
  const usage = calls.reduce((total, call) => addUsage(total, call.usage), { ...EMPTY_USAGE });
  const completedDurations = turnList.map((turn) => turn.durationMs).filter(Number.isFinite);

  return {
    id: sessionId,
    title: threadNames.get(sessionId) || "Conversation sans titre",
    startedAt: meta?.timestamp || firstTimestamp,
    updatedAt: lastTimestamp || meta?.timestamp,
    cwd: meta?.cwd || null,
    projectName: projectNameFromCwd(meta?.cwd),
    projectGitHubUrl: normalizeGitHubRepositoryUrl(meta?.git?.repository_url),
    source: typeof meta?.source === "string" ? meta.source : meta?.source?.type || meta?.originator || "unknown",
    cliVersion: meta?.cli_version || null,
    modelProvider: meta?.model_provider || null,
    models,
    exchanges: turnList.length,
    completedExchanges: completedDurations.length,
    userMessages,
    assistantMessages,
    modelCalls: calls.length,
    durationMs: completedDurations.reduce((sum, value) => sum + value, 0),
    usage,
    turns: turnList,
    calls,
    weeklyQuota,
    weeklyQuotaHistory: mergeWeeklyQuotaObservations(weeklyQuotaObservations),
    parseErrors: parseErrors.length,
    filePath,
  };
}

export async function analyzeCodexUsage(options = {}) {
  const source = resolveCodexSource(options);
  const sourceStatus = await inspectCodexSource(options);
  assertUsableSource(sourceStatus);
  const names = await loadThreadNames(path.dirname(source.sessionIndexPath), source.sessionIndexPath);
  const roots = [source.sessionsPath, source.archivedSessionsPath];
  const fileLists = await Promise.all(roots.map(walkJsonl));
  const files = fileLists.flat();
  const sessions = [];
  const previousSessions = options.previousData?.analyzerVersion === ANALYZER_VERSION
    ? options.previousData.sessions || []
    : [];
  const previousByFile = new Map(previousSessions
    .filter((session) => session.filePath)
    .map((session) => [session.filePath, session]));
  const concurrency = Math.max(1, Math.min(32, Number(options.concurrency) || 16));
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        const info = await stat(file);
        const previous = previousByFile.get(file);
        if (previous && previous.fileSize === info.size && previous.fileModifiedAtMs === info.mtimeMs) {
          const title = names.get(previous.id) || previous.title || "Conversation sans titre";
          sessions.push(title === previous.title ? previous : { ...previous, title });
        } else {
          sessions.push({
            ...await parseSessionFile(file, names),
            fileSize: info.size,
            fileModifiedAtMs: info.mtimeMs,
          });
        }
      } catch (error) {
        sessions.push({ filePath: file, error: error.message });
      }
    }
  }));

  // A session may briefly exist in both active and archived folders. Keep the newest copy.
  const unique = new Map();
  for (const session of sessions.filter((item) => item.id)) {
    const existing = unique.get(session.id);
    if (!existing || String(session.updatedAt) > String(existing.updatedAt)) unique.set(session.id, session);
  }

  const weeklyQuotaHistory = mergeWeeklyQuotaObservations([...unique.values()]
    .flatMap((session) => session.weeklyQuotaHistory || (session.weeklyQuota ? [session.weeklyQuota] : [])));

  return {
    analyzerVersion: ANALYZER_VERSION,
    generatedAt: new Date().toISOString(),
    source: sourceStatus,
    weeklyQuota: weeklyQuotaHistory[0] || null,
    weeklyQuotaHistory,
    sessions: [...unique.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    errors: sessions.filter((item) => item.error),
  };
}

export async function usageFingerprint(options = {}) {
  if (typeof options === "string") options = { codexHome: options };
  const source = resolveCodexSource(options);
  const sourceStatus = await inspectCodexSource(options);
  assertUsableSource(sourceStatus);
  const roots = [source.sessionsPath, source.archivedSessionsPath];
  const files = (await Promise.all(roots.map(walkJsonl))).flat();
  let latest = 0;
  let bytes = 0;
  let cursor = 0;
  const concurrency = Math.min(64, Math.max(1, files.length));
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        const info = await stat(file);
        latest = Math.max(latest, info.mtimeMs);
        bytes += info.size;
      } catch { /* File may move to archives while scanning. */ }
    }
  }));
  let indexFingerprint = "missing";
  try {
    const info = await stat(source.sessionIndexPath);
    if (info.isFile()) indexFingerprint = `${info.mtimeMs}:${info.size}`;
  } catch (error) {
    if (!["ENOENT", "ENOTDIR", "EACCES", "EPERM"].includes(error.code)) throw error;
  }
  return `${ANALYZER_VERSION}:${files.length}:${latest}:${bytes}:${indexFingerprint}`;
}
