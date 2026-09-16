import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("quota API filters calls in SQLite, isolates owners, paginates and validates unchanged data", async () => {
  const database = new DatabaseSync(":memory:");
  const globalsKey = `quotaApiTest${process.pid}`;
  let sessionQueries = 0;
  globalThis[globalsKey] = { prepare(sql) {
    if (sql.includes("AS snapshot_json")) sessionQueries++;
    const statement = database.prepare(sql);
    return { bind(...values) { return {
      first: async () => statement.get(...values),
      all: async () => ({ results: statement.all(...values) }),
    }; } };
  } };
  const load = async (path, prefix) => {
    const source = (await readFile(new URL(path, import.meta.url), "utf8")).replace(/^import .*;\r?\n/gm, "");
    return import(`data:text/javascript;base64,${Buffer.from(prefix + stripTypeScriptTypes(source)).toString("base64")}`);
  };
  try {
    database.exec(`CREATE TABLE mesh_nodes (id TEXT PRIMARY KEY, owner_id TEXT, alias TEXT, enrolled_at TEXT, last_seen TEXT, revoked_at TEXT, privacy_json TEXT, short_quota_json TEXT, quota_json TEXT, quota_history_json TEXT, analyzer_version INTEGER, last_generated_at TEXT);
      CREATE TABLE mesh_sessions (node_id TEXT, session_id TEXT, snapshot_json TEXT, PRIMARY KEY(node_id, session_id));
      CREATE TABLE dashboard_preferences (owner_id TEXT, theme TEXT);`);
    const reset = new Date(Date.now() + 3 * 86400000).toISOString();
    const start = new Date(Date.parse(reset) - 7 * 86400000).toISOString();
    const now = new Date().toISOString();
    const quota = { startsAt: start, resetsAt: reset, usedPercent: 30, remainingPercent: 70, windowMinutes: 10080, observedAt: now };
    const insertNode = database.prepare("INSERT INTO mesh_nodes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    for (const [node, owner, revoked] of [["a", "owner", null], ["b", "other", null], ["c", "owner", now]]) insertNode.run(node, owner, node, start, now, revoked, "{}", null, JSON.stringify(quota), JSON.stringify([quota]), 10, now);
    const value = { timestamp: now, model: "gpt-5", serviceTier: "default", usage: { inputTokens: 1000, outputTokens: 100 } };
    const insertSession = database.prepare("INSERT INTO mesh_sessions VALUES (?, ?, ?)");
    for (let i = 0; i < 501; i++) insertSession.run("a", String(i).padStart(4, "0"), JSON.stringify({ startedAt: "2020-01-01", title: "never-return-this-title", calls: [{ ...value, timestamp: "2020-01-01T00:00:00Z" }, value], turns: [{ private: "omit" }] }));
    for (const node of ["b", "c"]) insertSession.run(node, "excluded", JSON.stringify({ calls: [value] }));
    const prefix = `import { readSessionSlices } from ${JSON.stringify(new URL("../lib/session-reader.ts", import.meta.url).href)};\nimport { normalizeQuotaPeriods, matchesQuotaEtag } from ${JSON.stringify(new URL("../../public/quota-periods.js", import.meta.url).href)};\nconst db = () => globalThis[${JSON.stringify(globalsKey)}];\n`;
    const usage = await load("../lib/usage.ts", prefix);
    globalThis[`${globalsKey}Metadata`] = usage.quotaMetadataForOwner;
    const route = await load("../app/api/quota/route.ts", prefix + `
      import { createQuotaDetail } from ${JSON.stringify(new URL("../../public/quota-data.js", import.meta.url).href)};
      import { requireViewer } from ${JSON.stringify(new URL("../lib/auth.ts", import.meta.url).href)};
      import { json } from ${JSON.stringify(new URL("../lib/mesh.ts", import.meta.url).href)};
      const quotaMetadataForOwner = globalThis[${JSON.stringify(`${globalsKey}Metadata`)}];\n`);
    const request = (query = "", headers = {}) => new Request(`http://localhost/api/quota${query}`, { headers: { "oai-authenticated-user-id": "owner", "oai-authenticated-user-email": "owner@example.test", ...headers } });
    assert.equal((await route.GET(new Request("http://localhost/api/quota"))).status, 401);
    const metadataResponse = await route.GET(request());
    const metadata = await metadataResponse.json();
    assert.equal(metadata.sessionCount, 501);
    assert.deepEqual(metadata.sessions, []);
    assert.equal(sessionQueries, 0);
    const response = await route.GET(request("?detail=1"));
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(sessionQueries, 2);
    assert.equal(data.sessions[0].calls.length, 501);
    assert.ok(data.sessions[0].calls.every((call) => call.timestamp === now));
    assert.ok(!JSON.stringify(data).includes("never-return"));
    database.prepare("UPDATE mesh_nodes SET last_seen = ? WHERE id = 'a'").run(new Date(Date.now() + 60000).toISOString());
    const unchanged = await route.GET(request("?detail=1", { "If-None-Match": `W/${response.headers.get("etag")}` }));
    assert.equal(unchanged.status, 304);
    assert.equal(sessionQueries, 2);
    database.prepare("UPDATE mesh_nodes SET last_generated_at = ? WHERE id = 'a'").run(new Date(Date.now() + 60000).toISOString());
    const changed = await route.GET(request("", { "If-None-Match": metadataResponse.headers.get("etag") }));
    assert.equal(changed.status, 200);
    assert.notEqual((await changed.json()).revision, metadata.revision);
  } finally {
    database.close();
    delete globalThis[globalsKey];
    delete globalThis[`${globalsKey}Metadata`];
  }
});
