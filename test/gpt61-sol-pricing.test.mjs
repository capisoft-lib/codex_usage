import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { apiCostOfCalls, apiPriceFor, mergeApiPricing } from "../public/api-pricing.js";
import { codexCreditsOfCalls, creditRateFor, fastMultiplierFor, usageProfilesOfCalls } from "../public/usage-pricing.js";
import { resolveRate } from "../public/pricing-catalog.js";
import { createPricingReport, pricingHistoryMarkup, PRICING_I18N } from "../public/pricing-ui.js";
import { createPageData } from "../public/page-data.js";
import { createQuotaDetail } from "../public/quota-data.js";
import { buildQuotaForecast, estimateQuotaCapacityCredits } from "../public/quota-forecast.js";
import { parseSessionFile } from "../src/analyzer.mjs";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";
import { validateSyncPayload } from "../src/mesh-protocol.mjs";
import { openSqlite } from "../src/storage/sqlite.mjs";
import { LocalRepository } from "../src/storage/local-repository.mjs";
import { readSessionSlices } from "../src/storage/relational-reader.mjs";

const model = "gpt-6.1-sol";
const usage = { inputTokens: 200_000, cachedInputTokens: 100_000, cacheWriteInputTokens: 40_000, outputTokens: 10_000 };
const call = (overrides = {}) => ({ model, timestamp: "2026-09-30T12:00:00Z", serviceTier: "default", usage, ...overrides });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("Sol 6.1 uses its own cache prices without changing Sol 6 or saved custom settings", () => {
  const pricing = mergeApiPricing();
  assert.deepEqual(apiPriceFor(pricing, model), { input: 2, cached: 0.1, output: 10, exact: true, key: model });
  assert.deepEqual(creditRateFor(model), { input: 50, cached: 2.5, output: 250, key: model });
  assert.equal(apiPriceFor(pricing, "gpt-6-sol").cached, 0.2);
  assert.equal(creditRateFor("gpt-6-sol").cached, 5);
  const saved = { schemaVersion: 2, mode: "custom", models: { "gpt-6-sol": { input: 3, cached: 0.3, output: 12 } } };
  const copy = structuredClone(saved);
  const merged = mergeApiPricing(saved);
  assert.equal(apiPriceFor(merged, "gpt-6-sol").input, 3);
  assert.equal(apiPriceFor(merged, model).cached, 0.1);
  assert.deepEqual(saved, copy);
});

test("Sol 6.1 launch boundaries use UTC and reject unknown variants and unsupported tiers", () => {
  for (const calculator of [apiCostOfCalls, codexCreditsOfCalls]) {
    assert.equal(calculator([call({ timestamp: "2026-09-29T01:59:59.999+02:00" })]).unratedCalls, 1);
    assert.equal(calculator([call({ timestamp: "2026-09-29T02:00:00+02:00" })]).boundaryCalls, 1);
    assert.equal(calculator([call()]).estimatedCalls, 0);
    for (const variant of ["gpt-6.1", `${model}-private`, `${model}-preview`]) assert.equal(calculator([call({ model: variant })]).unratedCalls, 1);
    for (const serviceTier of ["ultrafast", "batch", "flex"]) assert.equal(calculator([call({ serviceTier })]).unratedCalls, 1);
    assert.equal(calculator([call({ model: `${model}-2026-09-29` })]).unratedCalls, 0);
  }
  assert.equal(resolveRate("api", " GPT-6.1-SOL ", call().timestamp).key, model);
});

test("refreshing catalog verification does not move established historical Fast dates", () => {
  assert.equal(resolveRate("api", "gpt-5", "2026-09-24").rate.fastFrom, "2026-09-23");
  assert.equal(apiCostOfCalls([call({ model: "gpt-5", timestamp: "2026-09-24", serviceTier: "fast", usage: { ...usage, cacheWriteInputTokens: 0 } })]).unratedCalls, 0);
});

test("Sol 6.1 API cache writes are charged once and Fast supports both recorded names", () => {
  near(apiCostOfCalls([call()]).cost, 0.33);
  for (const serviceTier of ["fast", "priority"]) {
    const priced = apiCostOfCalls([call({ serviceTier })]);
    near(priced.freshInputCost, 0.24);
    near(priced.cachedInputCost, 0.02);
    near(priced.cacheWriteCost, 0.2);
    near(priced.outputCost, 0.2);
    near(priced.cost, 0.66);
    assert.equal(priced.unobservedCacheWriteCalls, 0);
  }
});

test("Sol 6.1 long context starts strictly above 272000 and stacks with Fast", () => {
  for (const [inputTokens, expected, longCalls] of [[272_000, 0.544, 0], [272_001, 1.088004, 1]]) {
    const priced = apiCostOfCalls([call({ usage: { inputTokens, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0 } })]);
    near(priced.cost, expected);
    assert.equal(priced.longContextCalls, longCalls);
  }
  const priced = apiCostOfCalls([call({ serviceTier: "fast", usage: { ...usage, inputTokens: 300_000 } })]);
  near(priced.cost, 2.02);
  near(priced.cachedInputCost, 0.04);
  near(priced.cacheWriteCost, 0.4);
  near(priced.outputCost, 0.3);
});

test("Sol 6.1 credits use Fast 2x and subscription calibration uses 2.5x", () => {
  near(codexCreditsOfCalls([call()]).credits, 7.75);
  for (const serviceTier of ["fast", "priority"]) {
    const fast = call({ serviceTier });
    near(codexCreditsOfCalls([fast]).credits, 15.5);
    near(codexCreditsOfCalls([fast], { billing: "subscription" }).credits, 19.375);
    assert.equal(fastMultiplierFor(model, serviceTier), 2);
    assert.equal(usageProfilesOfCalls([fast])[0].multiplier, 2);
  }
  // The API long-context surcharge and cache-write premium do not apply to credits.
  near(codexCreditsOfCalls([call({ usage: { ...usage, inputTokens: 300_000 } })]).credits, 12.75);
});

test("Sol 6.1 pricing exports and history retain evidence and reproducible amounts", () => {
  const report = createPricingReport([call({ serviceTier: "fast" })], mergeApiPricing());
  for (const [result, key] of [[report.api, "cost"], [report.credits, "credits"]]) {
    const total = Object.values(result.usageByRate).reduce((sum, bucket) => sum +
      (bucket.freshInputTokens * bucket.appliedRates.input + bucket.cachedInputTokens * bucket.appliedRates.cached +
       bucket.outputTokens * bucket.appliedRates.output + (bucket.cacheWriteInputTokens || 0) * (bucket.appliedRates.cacheWrite || 0)) / 1e6, 0);
    near(total, result[key]);
  }
  assert.equal(report.rates.filter(rate => rate.model === model).length, 2);
  assert.equal(report.rates.find(rate => rate.model === model && rate.billing === "credits").subscriptionFastMultiplier, 2.5);
  const html = pricingHistoryMarkup(key => PRICING_I18N.en[key] || key, model);
  assert.ok(html.includes("2 / 0.1 / 10") && html.includes("50 / 2.5 / 250"));
});

test("collector and Mesh preserve Sol 6.1 IDs, efforts, tiers and cache counters", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "gpt61-pricing-"));
  try {
    const file = path.join(dir, "rollout.jsonl");
    const rows = [
      { type: "session_meta", timestamp: "2026-09-30T10:00:00Z", payload: { id: "gpt61-fixture", cwd: "/private/project", source: "cli" } },
      { type: "event_msg", timestamp: "2026-09-30T10:00:01Z", payload: { type: "task_started", turn_id: "sol61-turn" } },
      { type: "turn_context", timestamp: "2026-09-30T10:00:02Z", payload: { turn_id: "sol61-turn", model, effort: "max", service_tier: "fast" } },
      { type: "event_msg", timestamp: "2026-09-30T10:00:03Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 1000, cached_input_tokens: 500, cache_write_input_tokens: 200, output_tokens: 100, total_tokens: 1100 } } } },
    ];
    await writeFile(file, rows.map(JSON.stringify).join("\n"));
    const session = await parseSessionFile(file);
    const mesh = sanitizeUsageForMesh({ sessions: [session], generatedAt: "2026-09-30T10:01:00Z" }, { projectSalt: "test" });
    const captured = mesh.sessions[0].calls;
    assert.equal(captured[0].model, model);
    assert.equal(captured[0].effort, "max");
    assert.equal(captured[0].serviceTier, "fast");
    assert.equal(captured[0].usage.cacheWriteInputTokens, 200);
    near(apiCostOfCalls(captured).cost, 0.0043);
    near(codexCreditsOfCalls(captured).credits, 0.1025);
    validateSyncPayload({ kind: "sync", snapshotVersion: 1, analyzerVersion: mesh.analyzerVersion, generatedAt: mesh.generatedAt, privacy: mesh.privacy, upserts: mesh.sessions, removals: [] });
    assert.ok(!JSON.stringify(mesh).includes("/private/project"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("relational summaries match raw Sol 6.1 pricing and preserve model filters", async () => {
  const db = openSqlite();
  try {
    const repo = new LocalRepository(db);
    const calls = [call(), call({ serviceTier: "fast" }), call({ usage: { ...usage, inputTokens: 300_000 } }), call({ model: "gpt-6-sol" })];
    repo.saveUsage({ generatedAt: "2026-09-30T13:00:00Z", sessions: [{ id: "sol61", models: [model, "gpt-6-sol"], startedAt: "2026-09-30", calls, turns: [] }] }, "fixture", "2026-09-30T13:00:00Z");
    const query = { view: "conversations", start: "2026-09-30T00:00:00Z", end: "2026-09-30T23:59:59Z", model };
    const expected = createPageData(repo.metadata(), query);
    expected.add(repo.sessions("local")[0]);
    const actual = createPageData(repo.metadata(), query);
    await readSessionSlices(db, "local", query.start, query.end, false, null, row => actual.add(JSON.parse(row.snapshot_json)), false, { aggregate: true, model });
    const raw = expected.finish().sessions[0].summary;
    const aggregated = actual.finish().sessions[0].summary;
    near(aggregated.cost.cost, raw.cost.cost);
    near(aggregated.credits.credits, raw.credits.credits);
    assert.equal(aggregated.count, 3);
  } finally { db.close(); }
});

test("quota forecast uses Sol 6.1 subscription weighting independently from purchased credits", () => {
  const now = new Date("2026-09-30T12:00:00Z");
  const quota = { startsAt: "2026-09-29T00:00:00Z", resetsAt: "2026-10-06T00:00:00Z", observedAt: now.toISOString(), peakObservedAt: now.toISOString(), usedPercent: 30, peakUsedPercent: 30, planType: "pro", windowMinutes: 10080 };
  const calls = [call({ timestamp: "2026-09-30T02:00:00Z" }), call({ timestamp: "2026-09-30T08:00:00Z", serviceTier: "fast" })];
  const builder = createQuotaDetail({ weeklyQuota: quota, weeklyQuotaHistory: [quota], sessions: [] }, quota.resetsAt, now);
  calls.forEach(value => builder.add(value));
  const samples = calls.map(value => ({ timestamp: value.timestamp, value: codexCreditsOfCalls([value], { billing: "subscription" }).credits, rated: true }));
  const expected = buildQuotaForecast({ samples, rangeStart: quota.startsAt, rangeEnd: quota.resetsAt, observedAt: quota.observedAt, asOf: now, usedPercent: quota.usedPercent, project: true,
    capacityCredits: estimateQuotaCapacityCredits({ samples, quotaPeriods: [quota], planType: quota.planType }) });
  const actual = builder.finish().quotaDetail.forecast;
  assert.equal(actual.status, "ready");
  near(actual.capacityCredits, expected.capacityCredits);
  near(actual.expectedFinalPercent, expected.expectedFinalPercent);
});
