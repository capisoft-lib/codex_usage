import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("mesh transport never references Codex credentials or raw JSONL", async () => {
  const files = await Promise.all([
    readFile(new URL("../src/mesh-agent.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/mesh-privacy.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/mesh-protocol.mjs", import.meta.url), "utf8"),
  ]);
  const implementation = files.join("\n");
  assert.doesNotMatch(implementation, /auth\.json|session_index|\.jsonl|prompt|reasoning_content|tool_output/i);
});

test("Sites hosting declaration contains bindings but no credentials", async () => {
  const hosting = JSON.parse(await readFile(new URL("../sites-hub/.openai/hosting.json", import.meta.url), "utf8"));
  assert.equal(hosting.d1, "DB");
  assert.equal(hosting.r2, null);
  assert.match(hosting.project_id, /^appgprj_[a-f0-9]+$/);
  assert.equal(JSON.stringify(hosting).match(/token|secret|password|key/i), null);
});
