import { createReadStream } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import readline from "node:readline";

const EMPTY_USAGE = Object.freeze({
  inputTokens: 0,
  cachedInputTokens: 0,
  outputTokens: 0,
  reasoningOutputTokens: 0,
  totalTokens: 0,
});

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

async function walkJsonl(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === "ENOENT") return;
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

export async function loadThreadNames(codexHome) {
  const names = new Map();
  try {
    const content = await readFile(path.join(codexHome, "session_index.jsonl"), "utf8");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (row.id && row.thread_name) names.set(row.id, row.thread_name);
      } catch { /* Ignore a partially written index line. */ }
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return names;
}

function createTurn(id, timestamp, model, effort) {
  return {
    id,
    startedAt: timestamp,
    completedAt: null,
    durationMs: null,
    model: model || "unknown",
    effort: effort || null,
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
  let userMessages = 0;
  let assistantMessages = 0;
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
        const turn = turns.get(currentTurnId);
        if (turn) {
          turn.model = currentModel;
          turn.effort = currentEffort;
        }
        continue;
      }

      if (row.type !== "event_msg") continue;
      const payload = row.payload || {};

      if (payload.type === "task_started") {
        currentTurnId = payload.turn_id || `turn-${turns.size + 1}`;
        if (!turns.has(currentTurnId)) {
          // `started_at` has existed both as Unix seconds and ISO text. The event
          // timestamp is stable across the observed formats and is preferable.
          turns.set(currentTurnId, createTurn(currentTurnId, timestamp || payload.started_at, currentModel, currentEffort));
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
    parseErrors: parseErrors.length,
    filePath,
  };
}

export async function analyzeCodexUsage(options = {}) {
  const codexHome = options.codexHome || process.env.CODEX_HOME || path.join(homedir(), ".codex");
  const names = await loadThreadNames(codexHome);
  const roots = [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")];
  const fileLists = await Promise.all(roots.map(walkJsonl));
  const files = fileLists.flat();
  const sessions = [];
  const concurrency = Math.max(1, Math.min(16, Number(options.concurrency) || 8));
  let cursor = 0;
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (cursor < files.length) {
      const file = files[cursor++];
      try {
        sessions.push(await parseSessionFile(file, names));
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

  return {
    generatedAt: new Date().toISOString(),
    codexHome,
    sessions: [...unique.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    errors: sessions.filter((item) => item.error),
  };
}

export async function usageFingerprint(codexHome = process.env.CODEX_HOME || path.join(homedir(), ".codex")) {
  const roots = [path.join(codexHome, "sessions"), path.join(codexHome, "archived_sessions")];
  const files = (await Promise.all(roots.map(walkJsonl))).flat();
  let latest = 0;
  let bytes = 0;
  for (const file of files) {
    try {
      const info = await stat(file);
      latest = Math.max(latest, info.mtimeMs);
      bytes += info.size;
    } catch { /* File may move to archives while scanning. */ }
  }
  return `${files.length}:${latest}:${bytes}`;
}
