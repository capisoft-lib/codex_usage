import assert from "node:assert/strict";
import test from "node:test";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";

const usage = {
  analyzerVersion: 3,
  generatedAt: "2026-08-14T10:00:00.000Z",
  source: { mode: "local", sessionsAvailable: true },
  weeklyQuota: null,
  sessions: [{
    id: "session-private",
    title: "Nom secret de la conversation",
    cwd: "C:\\Users\\Alice\\SecretProject",
    models: [], usage: { inputTokens: 1, cachedInputTokens: 0, outputTokens: 1, reasoningOutputTokens: 0, totalTokens: 2 },
    calls: [], turns: [],
  }],
  errors: [],
};

test("default mesh privacy removes titles, usernames, and full project paths", () => {
  const sanitized = sanitizeUsageForMesh(usage, { projectSalt: "test-salt" });
  const serialized = JSON.stringify(sanitized);
  assert.doesNotMatch(serialized, /Alice|SecretProject|Nom secret/);
  assert.match(sanitized.sessions[0].cwd, /^project-[a-f0-9]{12}$/);
  assert.match(sanitized.sessions[0].title, /^Conversation [a-f0-9]{8}$/);
});

test("basename and title disclosure require explicit choices", () => {
  const sanitized = sanitizeUsageForMesh(usage, { projectSalt: "test-salt", projectMode: "basename", includeTitles: true });
  assert.equal(sanitized.sessions[0].cwd, "SecretProject");
  assert.equal(sanitized.sessions[0].title, "Nom secret de la conversation");
});
