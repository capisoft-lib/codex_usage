import { analyzeCodexUsage } from "../src/analyzer.mjs";
import { buildQuotaForecast, estimateQuotaCapacityCredits } from "../public/quota-forecast.js";
import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PRICING_CATALOG, PRICING_CATALOG_VERSION, catalogStatus, resolveRate, sourceUrl } from "../public/pricing-catalog.js";
import { apiCostOfCalls, apiPriceFor, mergeApiPricing } from "../public/api-pricing.js";
import { codexCreditsOfCalls } from "../public/usage-pricing.js";
import { PRICING_I18N, createPricingReport, pricingHistoryMarkup } from "../public/pricing-ui.js";
import { parseSessionFile } from "../src/analyzer.mjs";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";
import { validateSyncPayload } from "../src/mesh-protocol.mjs";

const call = (model, timestamp, usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 1_000_000 }, serviceTier = "default") => ({ model, timestamp, usage, serviceTier });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-9, `${actual} != ${expected}`);

test("catalog entries have unique stable IDs, evidence, valid nonoverlapping periods and immutable rates", () => {
  assert.equal(new Set(PRICING_CATALOG.map((rate) => rate.id)).size, PRICING_CATALOG.length);
  for (const rate of PRICING_CATALOG) {
    assert.ok(Object.isFrozen(rate) && Object.isFrozen(rate.standard));
    assert.ok(Number.isFinite(Date.parse(rate.effectiveFrom)));
    assert.ok(!rate.effectiveTo || rate.effectiveFrom < rate.effectiveTo);
    assert.ok(["documented", "observed", "reconstructed"].includes(rate.evidence));
    for (const source of rate.sources) assert.match(sourceUrl(source), /^https:\/\/(developers\.openai\.com|learn\.chatgpt\.com|openai\.com|github\.com)\//);
    for (const value of Object.values(rate.standard)) assert.ok(value === null || Number.isFinite(value) && value >= 0);
    assert.equal(resolveRate(rate.billing, rate.model, rate.effectiveFrom).rate.id, rate.id);
  }
});

test("twelve months of GPT-5 calls retain their own historical rate", () => {
  const calls = Array.from({ length: 13 }, (_, i) => call("gpt-5", new Date(Date.UTC(2025, 8 + i, 5)).toISOString()));
  const result = apiCostOfCalls(calls);
  assert.equal(result.cost, 130);
  assert.equal(result.unratedCalls, 0);
});

test("Sol's price cut uses consumption time including late imports", () => {
  const calls = [call("gpt-5.6-sol", "2026-08-20T23:59:59.999Z"), call("gpt-5.6-sol", "2026-08-21T00:00:00Z")];
  const result = apiCostOfCalls(calls);
  assert.equal(result.cost, 50);
  assert.equal(result.boundaryCalls, 1);
  assert.equal(Object.keys(result.ratesUsed).length, 2);
  assert.equal(apiCostOfCalls(calls.map((item) => ({ ...item, importedAt: "2027-01-01" }))).cost, 50);
});

test("offsets and the day-only UTC convention resolve the same instant", () => {
  assert.equal(apiCostOfCalls([call("gpt-5.6-sol", "2026-08-21T01:59:59+02:00")]).cost, 30);
  assert.equal(apiCostOfCalls([call("gpt-5.6-sol", "2026-08-21T02:00:00+02:00")]).cost, 20);
});

test("Terra and Luna reductions retain old input, cache and output rates", () => {
  const usage = { inputTokens: 200_000, cachedInputTokens: 100_000, outputTokens: 100_000 };
  for (const [model, oldCost, newCost] of [["gpt-5.6-terra", 1.775, 1.42], ["gpt-5.6-luna", 0.71, 0.142]]) {
    near(apiCostOfCalls([call(model, "2026-07-29", usage)]).cost, oldCost);
    near(apiCostOfCalls([call(model, "2026-07-31", usage)]).cost, newCost);
  }
});

test("Astra bills fresh/cache/output and Fast separately from Codex credits", () => {
  const usage = { inputTokens: 200_000, cachedInputTokens: 160_000, outputTokens: 20_000 };
  const calls = [call("gpt-6-astra", "2026-09-04T12:00:00Z", usage, "priority")];
  near(apiCostOfCalls(calls).standardCost, 1.56);
  near(apiCostOfCalls(calls).cost, 3.12);
  near(codexCreditsOfCalls(calls).standardCredits, 39);
  near(codexCreditsOfCalls(calls).credits, 97.5);
});

test("Astra long context starts strictly above 272000 and stacks with API Fast", () => {
  for (const [input, expected, count] of [[272_000, 2.72, 0], [272_001, 5.44002, 1]]) {
    const result = apiCostOfCalls([call("gpt-6-astra", "2026-09-04", { inputTokens: input, cachedInputTokens: 0, outputTokens: 0 })]);
    near(result.cost, expected); assert.equal(result.longContextCalls, count);
  }
  const calls = [call("gpt-6-astra", "2026-09-04", { inputTokens: 300_000, cachedInputTokens: 100_000, outputTokens: 10_000 }, "fast")];
  near(apiCostOfCalls(calls).cost, 9.9);
});

test("Fast long-context availability is dated independently from the base price", () => {
  const usage = { inputTokens: 300_000, cachedInputTokens: 0, outputTokens: 10_000 };
  assert.equal(apiCostOfCalls([call("gpt-5.6-sol", "2026-08-04", usage, "fast")]).unratedCalls, 1);
  near(apiCostOfCalls([call("gpt-5.6-sol", "2026-08-06", usage, "fast")]).cost, 6.9);
});

test("Codex credit changes are dated and do not follow the selected API simulation", () => {
  const calls = [call("gpt-5.6-sol", "2026-08-20"), call("gpt-5.6-sol", "2026-08-22")];
  assert.equal(codexCreditsOfCalls(calls).credits, 1250);
  assert.equal(createPricingReport(calls, mergeApiPricing({ schemaVersion: 2, mode: "current" })).credits.credits, 1250);
  assert.equal(codexCreditsOfCalls([call("gpt-5.5", "2026-05-01")]).unratedCalls, 1);
});

test("a promotion minimum end date does not restore older prices", () => {
  assert.equal(apiCostOfCalls([call("gpt-5.6-sol", "2026-11-22")]).cost, 20);
  assert.equal(catalogStatus("2026-11-22").reviewDue, true);
});

test("current and custom simulations cannot overwrite historical rates", () => {
  const calls = [call("gpt-5.6-sol", "2026-08-19")];
  const custom = mergeApiPricing({ schemaVersion: 2, mode: "custom", models: { "gpt-5.6-sol": { input: 1, cached: 0.1, output: 2 } } });
  assert.equal(apiCostOfCalls(calls, custom).cost, 2);
  assert.equal(apiCostOfCalls(calls, { ...custom, mode: "historical" }).cost, 30);
  assert.equal(apiCostOfCalls(calls, { ...custom, mode: "current", asOf: "2026-09-05" }).cost, 20);
  assert.equal(apiCostOfCalls(calls).cost, 30);
});

test("legacy browser prices are preserved but require explicit custom simulation", () => {
  const saved = { models: { "gpt-5.6-sol": { input: 5, cached: 0.5, output: 30 }, private: { input: 1, cached: 0, output: 2 } }, effortOverrides: { "gpt-6-astra::high": { input: 1, cached: 0, output: 3 } } };
  const settings = mergeApiPricing(saved);
  assert.equal(settings.mode, "historical"); assert.equal(settings.legacyCustom, true);
  assert.deepEqual(settings.models.private, saved.models.private);
  assert.equal(apiPriceFor(settings, "gpt-5.6-sol").output, 20);
  assert.equal(apiCostOfCalls([call("gpt-6-astra", "2026-09-04")], settings).cost, 50);
  const overrideCall = { ...call("gpt-6-astra", "2026-09-04"), effort: "high" };
  assert.equal(apiCostOfCalls([overrideCall], { ...settings, mode: "custom" }).cost, 3);
});

test("missing dates, pre-release calls, private model suffixes and unsupported tiers stay unrated", () => {
  const calls = [call("gpt-6-astra", null), call("gpt-6-astra", "bad"), call("gpt-6-astra", "2026-09-01"), call("gpt-6-astra-private", "2026-09-04"), call("gpt-5-mini-new", "2026-09-04"), call("gpt-6-astra", "2026-09-04", undefined, "ultrafast")];
  const result = apiCostOfCalls(calls);
  assert.equal(result.cost, 0); assert.equal(result.unratedCalls, calls.length); assert.equal(result.missingTimestampCalls, 2);
  assert.equal(result.officialCoverage, 0);
  assert.equal(apiCostOfCalls([call("gpt-5.6-sol-2026-08-01", "2026-08-22")]).cost, 20);
  assert.equal(apiCostOfCalls([call("gpt-5.6", "2026-08-22")]).cost, 20);
});

test("invalid counters and unavailable cache prices do not silently become zero-cost usage", () => {
  for (const usage of [{ inputTokens: NaN }, { inputTokens: -1 }, { inputTokens: 1, cachedInputTokens: 2 }, { outputTokens: Infinity }]) {
    const calls = [call("gpt-6-astra", "2026-09-04", usage)];
    assert.equal(apiCostOfCalls(calls).unratedCalls, 1);
    assert.equal(codexCreditsOfCalls(calls).unratedCalls, 1);
  }
  assert.equal(apiCostOfCalls([call("gpt-5.5-pro", "2026-09-04", { inputTokens: 100, cachedInputTokens: 100 })]).unratedCalls, 1);
});

test("export carries pricing provenance and aggregate totals without raw sessions or prompts", () => {
  const calls = [{ ...call("gpt-6-astra", "2026-09-04"), prompt: "PRIVATE_CONTENT", path: "PRIVATE_PATH" }];
  const report = createPricingReport(calls, mergeApiPricing());
  assert.equal(report.catalogVersion, PRICING_CATALOG_VERSION);
  assert.equal(report.api.cost, 50);
  assert.ok(report.rates.some((rate) => rate.model === "gpt-6-astra" && rate.billing === "api"));
  assert.ok(!JSON.stringify(report).includes("PRIVATE_"));
  assert.equal(apiCostOfCalls(calls, report.pricing).cost, report.api.cost);
  const recalculate = (buckets) => Object.values(buckets).reduce((sum, bucket) => sum + (bucket.freshInputTokens * bucket.appliedRates.input + bucket.cachedInputTokens * bucket.appliedRates.cached + bucket.outputTokens * bucket.appliedRates.output) / 1_000_000, 0);
  near(recalculate(report.api.usageByRate), report.api.cost);
  near(recalculate(report.credits.usageByRate), report.credits.credits);
});

test("all supported UI languages expose the same dated-pricing messages", () => {
  for (const messages of Object.values(PRICING_I18N)) assert.deepEqual(Object.keys(messages), Object.keys(PRICING_I18N.en));
  const html = pricingHistoryMarkup((key) => PRICING_I18N.en[key] || key, "gpt-6-astra");
  assert.ok(html.includes("gpt-6-astra") && html.includes("10 / 1 / 50"));
  assert.ok(!html.includes("gpt-5.6-sol"));
});

test("the existing collector preserves Astra model, timestamp, counters and service tier through Mesh", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "astra-pricing-"));
  try {
    const file = path.join(dir, "rollout.jsonl");
    const rows = [
      { type: "session_meta", timestamp: "2026-09-04T10:00:00Z", payload: { id: "astra-fixture", cwd: "C:/private/project", source: "cli" } },
      { type: "event_msg", timestamp: "2026-09-04T10:00:00Z", payload: { type: "task_started", turn_id: "astra-turn" } },
      { type: "turn_context", timestamp: "2026-09-04T10:00:01Z", payload: { model: "gpt-6-astra", effort: "max", service_tier: "priority" } },
      { type: "event_msg", timestamp: "2026-09-04T10:00:02Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 200000, cached_input_tokens: 160000, cache_write_input_tokens: 20000, output_tokens: 20000, total_tokens: 220000 } } } },
    ];
    await writeFile(file, rows.map((row) => JSON.stringify(row)).join("\n"));
    const session = await parseSessionFile(file);
    const mesh = sanitizeUsageForMesh({ sessions: [session], generatedAt: "2026-09-04T10:01:00Z" }, { projectSalt: "test" });
    const captured = mesh.sessions[0].calls[0];
    assert.equal(captured.model, "gpt-6-astra"); assert.equal(captured.serviceTier, "priority");
    assert.equal(captured.timestamp, "2026-09-04T10:00:02Z");
    assert.equal(captured.usage.cacheWriteInputTokens, 20000);
    assert.equal(mesh.sessions[0].usage.cacheWriteInputTokens, 20000);
    validateSyncPayload({ kind: "sync", snapshotVersion: 1, analyzerVersion: 8, generatedAt: mesh.generatedAt, privacy: mesh.privacy, upserts: mesh.sessions, removals: [] });
    near(apiCostOfCalls([captured]).cost, 3.22);
    near(codexCreditsOfCalls([captured]).credits, 97.5);
    assert.ok(!JSON.stringify(mesh).includes("C:/private/project"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("Astra cache writes replace ordinary input and stack with long context and Fast", () => {
  const usage = { inputTokens: 300000, cachedInputTokens: 100000, cacheWriteInputTokens: 100000, outputTokens: 10000 };
  const result = apiCostOfCalls([call("gpt-6-astra", "2026-09-04", usage, "fast")]);
  near(result.freshInputCost, 4); near(result.cachedInputCost, 0.4); near(result.cacheWriteCost, 5); near(result.outputCost, 1.5);
  near(result.cost, 10.9);
  const restored = Object.values(result.usageByRate).reduce((sum, bucket) => sum + (bucket.freshInputTokens * bucket.appliedRates.input + bucket.cachedInputTokens * bucket.appliedRates.cached + bucket.cacheWriteInputTokens * bucket.appliedRates.cacheWrite + bucket.outputTokens * bucket.appliedRates.output) / 1e6, 0);
  near(restored, result.cost);
  assert.equal(result.unobservedCacheWriteCalls, 0);
  const legacy = { ...usage }; delete legacy.cacheWriteInputTokens;
  assert.equal(apiCostOfCalls([call("gpt-6-astra", "2026-09-04", legacy)]).unobservedCacheWriteCalls, 1);
  assert.equal(apiCostOfCalls([call("gpt-6-astra", "2026-09-04", { ...usage, cacheWriteInputTokens: 300000 })]).unratedCalls, 1);
});


test("version 7 persisted sessions are reparsed to recover cache-write counters", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "astra-migrate-"));
  try {
    await writeFile(path.join(dir, "rollout.jsonl"), [
      { type: "session_meta", timestamp: "2026-09-04T10:00:00Z", payload: { id: "migration" } },
      { type: "turn_context", payload: { model: "gpt-6-astra" } },
      { type: "event_msg", timestamp: "2026-09-04T10:00:02Z", payload: { type: "token_count", info: { last_token_usage: { input_tokens: 100, cache_write_input_tokens: 40, output_tokens: 10, total_tokens: 110 } } } },
    ].map(JSON.stringify).join("\n"));
    const options = { sessionsPath: dir, archivedSessionsPath: path.join(dir, "missing"), sessionIndexPath: path.join(dir, "missing-index") };
    const first = await analyzeCodexUsage(options);
    const legacy = structuredClone(first); legacy.analyzerVersion = 7;
    delete legacy.sessions[0].calls[0].usage.cacheWriteInputTokens;
    const migrated = await analyzeCodexUsage({ ...options, previousData: legacy });
    assert.equal(migrated.analyzerVersion, 8);
    assert.equal(migrated.sessions[0].calls[0].usage.cacheWriteInputTokens, 40);
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("quota forecasts exclude incompletely priced historical periods", () => {
  const samples = [{ timestamp: "2026-09-04T01:00:00Z", value: 100, rated: true }, { timestamp: "2026-09-04T02:00:00Z", value: 0, rated: false }];
  const quotaPeriods = [{ startsAt: "2026-09-04T00:00:00Z", observedAt: "2026-09-04T03:00:00Z", usedPercent: 10 }];
  assert.equal(estimateQuotaCapacityCredits({ samples, quotaPeriods }), null);
  const options = { samples, rangeStart: quotaPeriods[0].startsAt, rangeEnd: "2026-09-11T00:00:00Z", observedAt: quotaPeriods[0].observedAt, asOf: quotaPeriods[0].observedAt, usedPercent: 10 };
  assert.equal(buildQuotaForecast(options).reason, "unrated-usage");
  assert.equal(buildQuotaForecast({ ...options, samples: samples.slice(0, 1) }).status, "ready");
});


test("custom aliases with different prices keep independently reproducible export buckets", () => {
  const pricing = mergeApiPricing({ schemaVersion: 2, mode: "custom", models: {
    "gpt-5.6": { input: 1, cached: 0.1, output: 3 },
    "gpt-5.6-sol": { input: 2, cached: 0.2, output: 6 },
  } });
  const calls = [call("gpt-5.6", "2026-09-04"), call("gpt-5.6-sol", "2026-09-04")];
  for (const ordered of [calls, [...calls].reverse()]) {
    const result = createPricingReport(ordered, pricing).api;
    near(result.cost, 9);
    assert.equal(Object.keys(result.usageByRate).length, 2);
    near(Object.values(result.usageByRate).reduce((sum, bucket) => sum + bucket.outputTokens * bucket.appliedRates.output / 1e6, 0), result.cost);
  }
});

test("missing cache-write measurements remain estimated while measured zero is covered", () => {
  const usage = { inputTokens: 100000, cachedInputTokens: 50000, outputTokens: 1000 };
  const missing = apiCostOfCalls([call("gpt-6-astra", "2026-09-04", usage)]);
  const measured = apiCostOfCalls([call("gpt-6-astra", "2026-09-04", { ...usage, cacheWriteInputTokens: 0 })]);
  assert.equal(missing.estimatedCalls, 1);
  assert.equal(missing.officialCoverage, 0);
  assert.equal(measured.estimatedCalls, 0);
  assert.equal(measured.officialCoverage, 1);
  assert.equal(missing.cost, measured.cost);
  const fullyCached = apiCostOfCalls([call("gpt-6-astra", "2026-09-04", { ...usage, cachedInputTokens: usage.inputTokens })]);
  assert.equal(fullyCached.unobservedCacheWriteCalls, 0);
  assert.equal(fullyCached.officialCoverage, 1);
});
