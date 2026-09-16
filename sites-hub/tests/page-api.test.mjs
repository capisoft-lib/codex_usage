import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("page API aggregates bounded batches, isolates owners, paginates and loads details on demand", async () => {
  const database = new DatabaseSync(":memory:");
  const globalsKey = `pageApiTest${process.pid}`;
  let sessionQueries = 0;
  let materializedRows=0;
  globalThis[globalsKey] = { prepare(sql) {
    if (sql.includes("AS snapshot_json")) sessionQueries++;
    const statement = database.prepare(sql);
    return { bind(...values) { return {
      first: async () => statement.get(...values),
      run: async () => ({meta:statement.run(...values)}),
      all: async () => { const results=statement.all(...values); if(sql.includes("AS snapshot_json")) materializedRows+=results.length; return {results}; },
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
    for(let i=0;i<501;i++) insertSession.run("a",String(i).padStart(4,"0")+"-old",JSON.stringify({startedAt:"2020-01-01",models:["old-model"],cwd:"old-project",calls:[{...value,timestamp:"2020-01-01T00:00:00Z"}],turns:[]}));
    for (const node of ["b", "c"]) insertSession.run(node, "excluded", JSON.stringify({ calls: [value] }));
    database.exec(await readFile(new URL("../drizzle/0005_wise_anthem.sql", import.meta.url), "utf8"));
    const prefix = `import { readSessionSlices } from ${JSON.stringify(new URL("../lib/session-reader.ts", import.meta.url).href)};\nimport { normalizeQuotaPeriods, matchesQuotaEtag } from ${JSON.stringify(new URL("../../public/quota-periods.js", import.meta.url).href)};\nconst db = () => globalThis[${JSON.stringify(globalsKey)}];\n`;
    const usage = await load("../lib/usage.ts", prefix);
    globalThis[`${globalsKey}Metadata`] = usage.quotaMetadataForOwner;
    const route = await load("../app/api/page/route.ts", prefix + `
      import { createPageData } from ${JSON.stringify(new URL("../../public/page-data.js", import.meta.url).href)};
      import { requireViewer } from ${JSON.stringify(new URL("../lib/auth.ts", import.meta.url).href)};
      import { json } from ${JSON.stringify(new URL("../lib/mesh.ts", import.meta.url).href)};
      const quotaMetadataForOwner = globalThis[${JSON.stringify(`${globalsKey}Metadata`)}];\n`);
    const request = (query, headers = {}) => new Request(`http://localhost/api/page?${new URLSearchParams({query:JSON.stringify(query)})}`, {headers:{"oai-authenticated-user-id":"owner","oai-authenticated-user-email":"owner@example.test",...headers}});
    assert.equal((await route.GET(new Request("http://localhost/api/page"))).status,401);
    const settings = await route.GET(request({view:"settings"}));
    assert.equal(settings.status,200);assert.equal((await settings.json()).sessions.length,0);assert.equal(sessionQueries,0);
    const query={view:"overview",start,end:now};
    const response=await route.GET(request(query));assert.equal(response.status,200);
    const data=await response.json();assert.equal(data.pageData.totals.count,501);assert.equal(data.sessions.length,6);assert.equal(sessionQueries,2);assert.equal(materializedRows,501);
    assert.ok(data.sessions.every(s=>s.calls.length===0 && s.turns.length===0));
    const unchanged=await route.GET(request(query,{"If-None-Match":`W/${response.headers.get("etag")}`}));assert.equal(unchanged.status,304);assert.equal(sessionQueries,2);
    const list=await (await route.GET(request({...query,view:"conversations",page:2,pageSize:20}))).json();
    assert.equal(list.sessions.length,20);assert.equal(list.pageData.total,501);assert.equal(list.pageData.page,2);assert.ok(list.pageData.filters.models.includes("old-model"));
    const detail=await (await route.GET(request({...query,view:"detail",id:"a:0001"}))).json();assert.equal(detail.sessions.length,1);assert.equal(detail.sessions[0].calls.length,1);
    for(const id of ["b:excluded","c:excluded"]) {
      const blocked=await (await route.GET(request({...query,view:"detail",id}))).json();assert.equal(blocked.sessions.length,0);
    }
    assert.equal((await route.GET(request({view:"invalid"}))).status,400);
    // Date bounds must track edits and new snapshots, including malformed dates.
    database.prepare("UPDATE mesh_sessions SET snapshot_json=? WHERE node_id='a' AND session_id='0001'").run(JSON.stringify({calls:[{...value,timestamp:'2020-01-01'}, {...value,timestamp:'invalid'}]}));
    const indexed=database.prepare("SELECT first_call_day,last_call_day,invalid_call_dates FROM mesh_sessions WHERE node_id='a' AND session_id='0001'").get();
    assert.equal(indexed.first_call_day,indexed.last_call_day);assert.equal(indexed.invalid_call_dates,1);
    const updated=await (await route.GET(request({...query,view:'detail',id:'a:0001'}))).json();assert.equal(updated.sessions.length,0);
    database.prepare("INSERT INTO mesh_sessions(node_id,session_id,snapshot_json) VALUES('a','new',?)").run(JSON.stringify({calls:[value]}));
    assert.equal(database.prepare("SELECT invalid_call_dates FROM mesh_sessions WHERE session_id='new'").get().invalid_call_dates,0);
    const plan=database.prepare("EXPLAIN QUERY PLAN SELECT session_id FROM mesh_sessions WHERE node_id=? AND last_call_day>=julianday(?) AND first_call_day<=julianday(?)").all('a',start,now);
    assert.ok(plan.some(row=>row.detail.includes('USING INDEX mesh_sessions_node_call_range')));
  } finally {
    database.close();
    delete globalThis[globalsKey];
    delete globalThis[`${globalsKey}Metadata`];
  }
});
