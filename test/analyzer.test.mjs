import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { addUsage, normalizeUsage, parseSessionFile } from "../src/analyzer.mjs";

test("normalizes and adds token usage", () => {
  const usage = normalizeUsage({ input_tokens: 100, cached_input_tokens: 80, output_tokens: 20, reasoning_output_tokens: 5, total_tokens: 120 });
  assert.deepEqual(addUsage(usage, usage), { inputTokens: 200, cachedInputTokens: 160, outputTokens: 40, reasoningOutputTokens: 10, totalTokens: 240 });
});

test("parses turns, model calls and duration without message contents", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "codex-usage-"));
  const file = path.join(directory, "session.jsonl");
  const rows = [
    { timestamp: "2026-07-10T08:00:00.000Z", type: "session_meta", payload: { id: "session-1", timestamp: "2026-07-10T08:00:00.000Z", cwd: "C:\\repo", model_provider: "openai" } },
    { timestamp: "2026-07-10T08:00:01.000Z", type: "turn_context", payload: { turn_id: "turn-1", model: "gpt-test", effort: "medium" } },
    { timestamp: "2026-07-10T08:00:01.000Z", type: "event_msg", payload: { type: "task_started", turn_id: "turn-1", started_at: "2026-07-10T08:00:01.000Z" } },
    { timestamp: "2026-07-10T08:00:02.000Z", type: "event_msg", payload: { type: "user_message", message: "secret" } },
    { timestamp: "2026-07-10T08:00:03.000Z", type: "event_msg", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cached_input_tokens: 50, output_tokens: 10, total_tokens: 110 } } } },
    { timestamp: "2026-07-10T08:00:05.000Z", type: "event_msg", payload: { type: "task_complete", turn_id: "turn-1" } },
  ];
  await writeFile(file, rows.map(JSON.stringify).join("\n"));
  const result = await parseSessionFile(file, new Map([["session-1", "Test conversation"]]));
  assert.equal(result.title, "Test conversation");
  assert.equal(result.models[0], "gpt-test");
  assert.equal(result.exchanges, 1);
  assert.equal(result.modelCalls, 1);
  assert.equal(result.durationMs, 4000);
  assert.equal(result.usage.cachedInputTokens, 50);
  assert.equal(JSON.stringify(result).includes("secret"), false);
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
