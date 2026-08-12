import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Docker exposes only the required Codex log sources", async () => {
  const compose = await readFile(new URL("../compose.yaml", import.meta.url), "utf8");
  assert.match(compose, /target:\s*\/codex-data\/sessions/);
  assert.match(compose, /target:\s*\/codex-data\/archived_sessions/);
  assert.match(compose, /target:\s*\/codex-data\/session_index\.jsonl/);
  assert.doesNotMatch(compose, /target:\s*\/codex-data\s*(?:\r?\n|$)/);
  assert.doesNotMatch(compose, /auth\.json/i);
  assert.equal((compose.match(/read_only:\s*true/g) || []).length >= 4, true);
  assert.match(compose, /cap_drop:\s*\r?\n\s*- ALL/);
});

test("credential files are excluded from source control and Docker context", async () => {
  const [gitignore, dockerignore] = await Promise.all([
    readFile(new URL("../.gitignore", import.meta.url), "utf8"),
    readFile(new URL("../.dockerignore", import.meta.url), "utf8"),
  ]);
  assert.match(gitignore, /^auth\.json$/m);
  assert.match(dockerignore, /^auth\.json$/m);
});

test("the strict CSP is kept without runtime inline styles", async () => {
  const [server, app] = await Promise.all([
    readFile(new URL("../server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
  ]);
  assert.match(server, /style-src 'self'/);
  assert.doesNotMatch(server, /style-src[^;]*'unsafe-inline'/);
  assert.doesNotMatch(app, /\sstyle=/);
  assert.doesNotMatch(app, /\.style\./);
});

test("the published image instructions keep Codex mounts scoped and read-only", async () => {
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /capitaine\/codex-usage-dashboard:1\.0\.2/);
  assert.match(readme, /ghcr\.io\/capisoft-lib\/codex-usage-dashboard:1\.0\.2/);
  assert.match(readme, /target=\/codex-data\/sessions,readonly/);
  assert.match(readme, /target=\/codex-data\/archived_sessions,readonly/);
  assert.match(readme, /target=\/codex-data\/session_index\.jsonl,readonly/);
  assert.doesNotMatch(readme, /target=\/codex-data(?:[,"'\s]|$)/);
  assert.doesNotMatch(readme, /auth\.json,target=/i);
});
