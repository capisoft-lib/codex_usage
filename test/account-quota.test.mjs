import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { normalizeAccountQuotas, readAccountQuotas, applyAccountQuotas } from "../src/account-quota.mjs";
import { createUsageCollector } from "../src/usage-collector.mjs";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";

const stamp = "2026-09-07T14:00:00.000Z";
const response = (count) => ({
  accountId: "private-account", rateLimitResetCredits: { availableCount: count, credits: [{ id: "private-credit" }] },
  rateLimitsByLimitId: { codex: { limitId: "codex", planType: "pro",
    primary: { usedPercent: 6, windowDurationMins: 10080, resetsAt: 1789374335 } } },
});

test("reads the authoritative reset count, including zero, without private details", () => {
  for (const count of [3, 0, null, undefined, -1, "3"]) {
    const result = normalizeAccountQuotas(response(count), stamp);
    assert.equal(result.weeklyQuota.resetsAvailable, typeof count === "number" && count >= 0 ? count : null);
    assert.equal(result.weeklyQuota.observedAt, stamp);
    assert.equal(result.weeklyQuota.usedPercent, 6);
    assert.doesNotMatch(JSON.stringify(result), /private-account|private-credit/);
  }
  assert.equal(normalizeAccountQuotas({ rateLimits: { limitId: "codex_other" } }), null);
});

test("refreshes account counts without reanalyzing unchanged sessions, through public and Mesh payloads", async () => {
  let count = 3, analyses = 0;
  const collector = await createUsageCollector({ root: process.cwd(), env: { SNAPSHOT_PATH: "" },
    analyze: async () => { analyses++; return { sessions: [], generatedAt: stamp, weeklyQuotaHistory: [] }; },
    fingerprint: async () => "unchanged",
    accountQuotaReader: async () => count === null ? null : normalizeAccountQuotas(response(count), stamp),
    logger: { log() {}, warn() {}, error() {} },
  });
  for (const expected of [3, 2, 0, null]) {
    count = expected;
    const data = await collector.refresh();
    const published = await collector.localUsage();
    assert.equal(published.weeklyQuotaHistory[0].resetsAvailable, expected);
    const mesh = sanitizeUsageForMesh(data, { projectMode: "hash", includeTitles: false, projectSalt: "test" });
    assert.equal(mesh.quota.resetsAvailable, expected);
    assert.equal(mesh.quotaHistory[0].resetsAvailable, expected);
    assert.doesNotMatch(JSON.stringify(mesh), /private-account|private-credit/);
  }
  assert.equal(analyses, 1);
});

test("merges fresh account quotas while retaining older period measurements", () => {
  const old = { ...normalizeAccountQuotas(response(undefined), stamp).weeklyQuota, observedAt: "2026-09-07T13:00:00.000Z", usedPercent: 5 };
  const data = applyAccountQuotas({ weeklyQuotaHistory: [old] }, normalizeAccountQuotas(response(3), stamp));
  assert.equal(data.weeklyQuotaHistory[0].resetsAvailable, 3);
  assert.deepEqual(data.weeklyQuotaHistory[0].observations.map(q => q.usedPercent), [5, 6]);
});

test("App Server transport reads only limits and exits its child before resolving", async () => {
  let child;
  const script = `const r=require('node:readline').createInterface({input:process.stdin}); r.on('line',l=>{const m=JSON.parse(l); if(m.method==='initialize') console.log(JSON.stringify({id:1,result:{}})); else if(m.method==='account/rateLimits/read') console.log(JSON.stringify({id:2,result:${JSON.stringify(response(3))}})); else if(m.method!=='initialized') process.exit(2);});`;
  const result = await readAccountQuotas({ spawnImpl: (_exe, _args, options) => (child = spawn(process.execPath, ["-e", script], options)) });
  assert.equal(result.weeklyQuota.resetsAvailable, 3);
  assert.ok(child.exitCode !== null || child.signalCode !== null);
});

test("missing, stalled and unauthenticated App Servers yield unknown counts", async () => {
  assert.equal(await readAccountQuotas({ executable: "missing-codex-quota-test-executable" }), null);
  for (const script of ["setInterval(()=>{},1000)", "process.stdout.write(JSON.stringify({id:1,error:{code:401}})+'\\n');setInterval(()=>{},1000)"]) {
    let child;
    assert.equal(await readAccountQuotas({ timeoutMs: 200, spawnImpl: (_exe, _args, options) => (child = spawn(process.execPath, ["-e", script], options)) }), null);
    assert.ok(child.exitCode !== null || child.signalCode !== null);
  }
});
