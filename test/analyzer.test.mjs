import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addUsage, analyzeCodexUsage, inspectCodexSource, normalizeGitHubRepositoryUrl, normalizeUsage, normalizeWeeklyQuota, parseSessionFile, resolveCodexSource, usageFingerprint } from "../src/analyzer.mjs";

test("normalizes and adds token usage", () => {
  const usage = normalizeUsage({ input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 });
  assert.deepEqual(addUsage(usage, usage), { inputTokens: 200, cachedInputTokens: 160, outputTokens: 40, reasoningOutputTokens: 10, totalTokens: 240 });
});

test("normalizes the weekly Codex quota without inventing reset availability", () => {
  const quota = normalizeWeeklyQuota({
    primary: { used_percent: 12, window_minutes: 300, resets_at: 1783626099 },
    secondary: { used_percent: 36, window_minutes: 10080, resets_at: 1783769144 },
    plan_type: "pro",
  }, "2026-07-09T22:00:00.000Z");
  assert.equal(quota.usedPercent, 36);
  assert.equal(quota.remainingPercent, 64);
  assert.equal(quota.windowMinutes, 10080);
  assert.equal(quota.resetsAt, "2026-07-11T11:25:44.000Z");
  assert.equal(quota.resetsAvailable, null);
  assert.equal(quota.planType, "pro");
});

test("parses turns, model calls and duration without message contents", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-"));
  const file = path.join(directory, "session.jsonl");
  const rows = [
    { timestamp: "2026-07-10T08:00:00.000Z", type: "session_meta", payload: { id: "session-1", timestamp: "2026-07-10T08:00:00.000Z", cwd: "C:\\repo", model_provider: "openai", git: { repository_url: "git@github.com:OpenAI/Example.git", branch: "main", commit_hash: "secret" } } },
    { timestamp: "2026-07-10T08:00:00.500Z", type: "event_msg", payload: { type: "thread_settings_applied", thread_settings: { service_tier: "priority" } } },
    { timestamp: "2026-07-10T08:00:01.000Z", type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-test", effort: "medium" } },
    { timestamp: "2026-07-10T08:00:01.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1", started_at: "2026-07-10T08:00:01.000Z" } },
    { timestamp: "2026-07-10T08:00:02.000Z", type: "event_msg", payload: { type: "user_message", message: "secret" } },
    { timestamp: "2026-07-10T08:00:03.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, total_tokens: 110 } }, rate_limits: { primary: { used_percent: 21, window_minutes: 10080, resets_at: 1783769144 }, resets_remaining: 2, plan_type: "pro" } } },
    { timestamp: "2026-07-10T08:00:05.000Z", type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
  ];
  await writeFile(file, rows.map(JSON.stringify).join("\n"));
  const result = await parseSessionFile(file, new Map([["session-1", "Test conversation"]]));
  assert.equal(result.title, "Test conversation");
  assert.equal(result.models[0], "gpt-test");
  assert.equal(result.exchanges, 1);
  assert.equal(result.modelCalls, 1);
  assert.equal(result.turns[0].effort, "medium");
  assert.equal(result.turns[0].serviceTier, "priority");
  assert.equal(result.calls[0].effort, "medium");
  assert.equal(result.calls[0].serviceTier, "priority");
  assert.equal(result.durationMs, 4000);
  assert.equal(result.usage.cachedInputTokens, 50);
  assert.equal(result.weeklyQuota.remainingPercent, 79);
  assert.equal(result.weeklyQuota.resetsAvailable, 2);
  assert.equal(result.projectName, "repo");
  assert.equal(result.projectGitHubUrl, "https://github.com/openai/example");
  assert.equal(JSON.stringify(result).includes("commit_hash"), false);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("canonicalizes only credential-free GitHub repository URLs", () => {
  assert.equal(normalizeGitHubRepositoryUrl("https://TOKEN@GitHub.com/OpenAI/Example.git?ignored=1"), "https://github.com/openai/example");
  assert.equal(normalizeGitHubRepositoryUrl("ssh://git@github.com/OpenAI/Example.git"), "https://github.com/openai/example");
  assert.equal(normalizeGitHubRepositoryUrl("git@github.com:OpenAI/Example.git"), "https://github.com/openai/example");
  assert.equal(normalizeGitHubRepositoryUrl("https://gitlab.com/OpenAI/Example.git"), null);
});

test("prefers the event timestamp when started_at is Unix seconds", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-unix-"));
  const file = path.join(directory, "session.jsonl");
  const rows = [
    { timestamp: "2026-07-10T08:00:00.000Z", type: "session_meta", payload: { id: "session-unix" } },
    { timestamp: "2026-07-10T08:00:01.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1", started_at: 1783670401 } },
    { timestamp: "2026-07-10T08:00:06.000Z", type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
  ];
  await writeFile(file, rows.map(JSON.stringify).join("\n"));
  const result = await parseSessionFile(file);
  assert.equal(result.turns[0].startedAt, "2026-07-10T08:00:01.000Z");
  assert.equal(result.turns[0].durationMs, 5000);
});

test("reuses persisted per-file analysis when a session has not changed", async () => {
  const codexHome = await mkdtemp(path.join(tmpdir(), "codex-usage-incremental-"));
  const sessionsDirectory = path.join(codexHome, "sessions");
  await mkdir(sessionsDirectory, { recursive: true });
  const file = path.join(sessionsDirectory, "session.jsonl");
  await writeFile(file, [
    { timestamp: "2026-08-11T08:00:00.000Z", type: "session_meta", payload: { id: "incremental" } },
    { timestamp: "2026-08-11T08:00:01.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
  ].map(JSON.stringify).join("\n"));

  const first = await analyzeCodexUsage({ codexHome });
  const second = await analyzeCodexUsage({ codexHome, previousData: first });
  assert.equal(first.analyzerVersion, 4);
  assert.equal(second.sessions[0], first.sessions[0]);
  assert.equal(second.sessions[0].fileSize > 0, true);
  assert.equal(Number.isFinite(second.sessions[0].fileModifiedAtMs), true);

  const legacySnapshot = { ...first };
  delete legacySnapshot.analyzerVersion;
  const migrated = await analyzeCodexUsage({ codexHome, previousData: legacySnapshot });
  assert.notEqual(migrated.sessions[0], first.sessions[0]);
});

test("supports least-privilege scoped sources without a Codex home mount", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-usage-scoped-"));
  const sessionsPath = path.join(root, "mounted-sessions");
  const archivedSessionsPath = path.join(root, "mounted-archives");
  const sessionIndexPath = path.join(root, "mounted-index.jsonl");
  await mkdir(sessionsPath);
  await mkdir(archivedSessionsPath);
  await writeFile(sessionIndexPath, `${JSON.stringify({ id: "scoped", thread_name: "Scoped source" })}\n`);
  await writeFile(path.join(sessionsPath, "session.jsonl"), [
    { timestamp: "2026-08-12T08:00:00.000Z", type: "session_meta", payload: { id: "scoped" } },
    { timestamp: "2026-08-12T08:00:01.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1" } },
  ].map(JSON.stringify).join("\n"));

  const options = { sessionsPath, archivedSessionsPath, sessionIndexPath };
  assert.equal(resolveCodexSource(options).mode, "scoped");
  assert.deepEqual(await inspectCodexSource(options), {
    mode: "scoped",
    sessionsAvailable: true,
    archivedSessionsAvailable: true,
    sessionIndexAvailable: true,
  });
  const result = await analyzeCodexUsage(options);
  assert.equal(result.sessions[0].title, "Scoped source");
  assert.equal(result.source.mode, "scoped");
  assert.match(await usageFingerprint(options), /^1:/);
});

test("rejects a source with no readable session directory", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "codex-usage-missing-"));
  await assert.rejects(
    analyzeCodexUsage({
      sessionsPath: path.join(root, "missing-sessions"),
      archivedSessionsPath: path.join(root, "missing-archives"),
      sessionIndexPath: path.join(root, "missing-index.jsonl"),
    }),
    { code: "CODEX_SOURCE_UNAVAILABLE" },
  );
});
