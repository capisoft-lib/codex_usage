import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { apiCostOfCalls, mergeApiPricing } from "../public/api-pricing.js";
import { codexCreditsOfCalls, usageProfilesOfCalls } from "../public/usage-pricing.js";
import { PRICING_CATALOG, serviceTierRate, resolveRate } from "../public/pricing-catalog.js";
import { createPricingReport, serviceTierBadge, pricingHistoryMarkup, PRICING_I18N } from "../public/pricing-ui.js";
import { createPageData } from "../public/page-data.js";
import { createQuotaDetail } from "../public/quota-data.js";
import { parseSessionFile } from "../src/analyzer.mjs";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";
import { validateSyncPayload } from "../src/mesh-protocol.mjs";
import { openSqlite } from "../src/storage/sqlite.mjs";
import { LocalRepository } from "../src/storage/local-repository.mjs";
import { readSessionSlices } from "../src/storage/relational-reader.mjs";

const usage = { inputTokens: 200000, cachedInputTokens: 100000, cacheWriteInputTokens: 40000, outputTokens: 10000 };
const call = (model = "gpt-6.1-sol", tier = "ultrafast", timestamp = "2026-10-09T12:00:00Z", counters = usage) => ({ model, serviceTier: tier, timestamp, effort: "high", usage: counters });
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

for (const [model, apiDate, creditDate, standard] of [
  ["gpt-6-astra", "2026-09-29", "2026-09-30", 1.7],
  ["gpt-6.1-sol", "2026-10-08", "2026-10-08", 0.33],
]) {
  test(`${model} Ultrafast has independent dated API and credit gates`, () => {
    for (const [calculate, date] of [[apiCostOfCalls, apiDate], [codexCreditsOfCalls, creditDate]]) {
      const before = new Date(Date.parse(date) - 1).toISOString();
      assert.equal(calculate([call(model, "ultrafast", before)]).unratedCalls, 1);
      assert.equal(calculate([call(model, "ultrafast", date)]).boundaryCalls, 1);
      assert.equal(calculate([call(model)]).estimatedCalls, 0);
    }
    near(apiCostOfCalls([call(model)]).cost, standard * 6);
    const credits = codexCreditsOfCalls([call(model)]);
    near(credits.credits, credits.standardCredits * 6);
    near(codexCreditsOfCalls([call(model)], { billing: "subscription" }).credits, credits.standardCredits * 8);
    assert.equal(credits.ultrafastCalls, 1);
    assert.equal(credits.fastCalls, 0);
    assert.equal(apiCostOfCalls([call(model)]).fastCalls, 0);
    assert.equal(apiCostOfCalls([call(model)]).ultrafastCalls, 1);
  });

  test(`${model} Ultrafast stacks with whole-request long context and measured writes`, () => {
    for (const inputTokens of [272000, 272001]) {
      const counters = { ...usage, inputTokens };
      const standardCall = call(model, "standard", undefined, counters);
      const ultra = apiCostOfCalls([call(model, "ultrafast", undefined, counters)]);
      near(ultra.cost, apiCostOfCalls([standardCall]).cost * 6);
      assert.equal(ultra.longContextCalls, inputTokens > 272000 ? 1 : 0);
      assert.equal(ultra.unobservedCacheWriteCalls, 0);
      const rate = resolveRate("api", model, standardCall.timestamp).rate;
      near(ultra.cacheWriteCost, 40000 * rate.standard.input * 1.25 * 6 * (inputTokens > 272000 ? 2 : 1) / 1e6);
    }
  });
}

test("Fast credit correction keeps quota weighting separate and marks old multipliers reconstructed", () => {
  for (const model of ["gpt-5.4", "gpt-5.5", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna", "gpt-6-astra", "gpt-6-sol", "gpt-6-luna"]) {
    const current = codexCreditsOfCalls([call(model, "fast")]);
    near(current.credits, current.standardCredits * 2);
    near(codexCreditsOfCalls([call(model, "priority")], { billing: "subscription" }).credits, current.standardCredits * 2.5);
    const historical = codexCreditsOfCalls([call(model, "fast", "2026-09-24")]);
    assert.equal(historical.estimatedCalls, 1);
    assert.equal(current.estimatedCalls, 0);
  }
});

test("supported Batch/Flex API cards discount all counters without leaking into Codex quotas", () => {
  for (const model of ["gpt-6-astra", "gpt-6.1-sol", "gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-5.6-terra", "gpt-5.6-luna"]) {
    for (const tier of ["batch", "flex"]) {
      const discounted = apiCostOfCalls([call(model, tier)]);
      near(discounted.cost, apiCostOfCalls([call(model, "standard")]).cost * 0.5);
      assert.equal(discounted.discountedCalls, 1);
      assert.equal(discounted.boundaryCalls, 1);
      assert.equal(apiCostOfCalls([call(model, tier, "2026-10-08")]).unratedCalls, 1);
      assert.equal(codexCreditsOfCalls([call(model, tier)]).unratedCalls, 1);
      assert.equal(codexCreditsOfCalls([call(model, tier)], { billing: "subscription" }).unratedCalls, 1);
    }
  }
});

test("unsupported tiers and preview-only Ultrafast models stay unrated in every billing system", () => {
  for (const calculate of [apiCostOfCalls, codexCreditsOfCalls]) {
    for (const model of ["gpt-6-sol", "gpt-6-luna", "gpt-5.6-sol", "gpt-6-astra-private"]) assert.equal(calculate([call(model)]).unratedCalls, 1);
    for (const tier of ["auto", "scale", "turbo", "ultra-fast", "<script>"]) assert.equal(calculate([call(undefined, tier)]).unratedCalls, 1);
  }
  assert.equal(serviceTierRate(null, "ultrafast", "2026-10-09").multiplier, null);
});

test("Rosalind respects the explicit API billing start and observed credit coverage", () => {
  const counters = { inputTokens: 100000, cachedInputTokens: 50000, cacheWriteInputTokens: 0, outputTokens: 10000 };
  const model = "gpt-rosalind-research";
  assert.equal(apiCostOfCalls([call(model, "standard", "2026-09-07", counters)]).unratedCalls, 1);
  assert.equal(apiCostOfCalls([call(model, "standard", "2026-10-04", counters)]).cost, 0);
  near(apiCostOfCalls([call(model, "standard", "2026-10-05", counters)]).cost, 0.525);
  assert.equal(codexCreditsOfCalls([call(model, "standard", "2026-10-08", counters)]).unratedCalls, 1);
  near(codexCreditsOfCalls([call(model, "standard", "2026-10-09", counters)]).credits, 13.125);
  assert.equal(apiCostOfCalls([call(model, "fast")]).unratedCalls, 1);
  assert.equal(apiCostOfCalls([call("chat-latest", "standard", "2026-10-08", counters)]).unratedCalls, 1);
  near(apiCostOfCalls([call("chat-latest", "standard", "2026-10-09", counters)]).cost, 0.575);
});

test("mixed speed exports reproduce each tier and preserve custom prices", () => {
  const calls = ["standard", "fast", "ultrafast", "batch", "flex"].map(tier => call(undefined, tier));
  const settings = mergeApiPricing({ schemaVersion: 2, mode: "custom", asOf: "2026-10-09", models: { "gpt-6.1-sol": { input: 3, cached: 0.3, output: 12 } }, fastMultipliers: { "gpt-6.1-sol": 3 } });
  const copy = structuredClone(settings);
  const report = createPricingReport(calls, settings);
  assert.equal(Object.keys(report.api.usageByRate).length, 5);
  assert.deepEqual(settings, copy);
  for (const [result, key] of [[report.api, "cost"], [report.credits, "credits"]]) {
    const reconstructed = Object.values(result.usageByRate).reduce((sum, bucket) => sum + (bucket.freshInputTokens * bucket.appliedRates.input + bucket.cachedInputTokens * bucket.appliedRates.cached + bucket.outputTokens * bucket.appliedRates.output + (bucket.cacheWriteInputTokens || 0) * (bucket.appliedRates.cacheWrite || 0)) / 1e6, 0);
    near(reconstructed, result[key]);
  }
  assert.equal(report.credits.unratedCalls, 2);
  near(report.api.cost, report.api.standardCost + report.api.tierAdjustmentCost);
});

test("profiles, localized history and badges distinguish Ultrafast from Standard and escape unknown tiers", () => {
  const profiles = usageProfilesOfCalls(["standard", "fast", "ultrafast", "batch", "flex"].map(tier => call(undefined, tier)));
  assert.equal(profiles.length, 5);
  assert.equal(profiles[0].tier, "ultrafast");
  const ultra = profiles.find(profile => profile.tier === "ultrafast");
  assert.equal(ultra.multiplier, 6);
  assert.equal(ultra.fast, false);
  const t = key => PRICING_I18N.fr[key] || key;
  assert.ok(serviceTierBadge(t, ultra.tier, ultra.multiplier).includes("Ultrafast · ×6"));
  assert.ok(!serviceTierBadge(t, "<script>", null).includes("<script>"));
  const html = pricingHistoryMarkup(t, "gpt-6.1-sol");
  assert.ok(html.includes("Ultrafast ×6") && html.includes("×8") && html.includes("2026-10-08"));
  for (const messages of Object.values(PRICING_I18N)) assert.ok(messages["dated.tiers"]);
});

test("collector and Mesh preserve mixed Ultrafast turns without needing a schema or reparsing change", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "tier-fixture-"));
  try {
    const rows = [{ type: "session_meta", timestamp: "2026-10-09T12:00:00Z", payload: { id: "ultra-fixture", cwd: "/private/fixture" } }];
    for (const [i, tier] of ["standard", "ultrafast", "fast"].entries()) {
      rows.push({ type: "event_msg", timestamp: `2026-10-09T12:00:0${i * 3 + 1}Z`, payload: { type: "task_started", turn_id: `turn-${i}` } },
        { type: "turn_context", payload: { model: "gpt-6.1-sol", effort: "high", service_tier: tier } },
        { type: "event_msg", timestamp: `2026-10-09T12:00:0${i * 3 + 2}Z`, payload: { type: "token_count", info: { last_token_usage: { input_tokens: 200000, cached_input_tokens: 100000, cache_write_input_tokens: 40000, output_tokens: 10000, total_tokens: 210000 } } } });
    }
    const file = path.join(dir, "fixture.jsonl");
    await writeFile(file, rows.map(JSON.stringify).join("\n"));
    const session = await parseSessionFile(file);
    const mesh = sanitizeUsageForMesh({ sessions: [session], generatedAt: "2026-10-09T12:01:00Z" }, { projectSalt: "fixture" });
    const captured = mesh.sessions[0].calls;
    assert.deepEqual(captured.map(value => value.serviceTier), ["standard", "ultrafast", "fast"]);
    assert.equal(mesh.sessions[0].turns[1].serviceTier, "ultrafast");
    near(apiCostOfCalls(captured).cost, 2.97);
    near(codexCreditsOfCalls(captured).credits, 69.75);
    validateSyncPayload({ kind: "sync", snapshotVersion: 1, analyzerVersion: mesh.analyzerVersion, generatedAt: mesh.generatedAt, privacy: mesh.privacy, upserts: mesh.sessions, removals: [] });
    assert.ok(!JSON.stringify(mesh).includes("/private/fixture"));
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("SQL summaries retain mixed tiers, prices and Ultrafast conversation search", async () => {
  const db = openSqlite();
  try {
    const repo = new LocalRepository(db);
    const calls = ["standard", "fast", "ultrafast", "batch", "flex"].flatMap(tier => [call(undefined, tier), call(undefined, tier), call(undefined, tier, undefined, { ...usage, inputTokens: 300000 })]);
    repo.saveUsage({ generatedAt: "2026-10-09T13:00:00Z", sessions: [{ id: "mixed", models: ["gpt-6.1-sol"], startedAt: "2026-10-09", calls, turns: [] }] }, "fixture", "2026-10-09T13:00:00Z");
    for (const search of ["", "ultrafast"]) {
      const query = { view: "conversations", search, start: "2026-10-09T00:00:00Z", end: "2026-10-09T23:59:59Z" };
      const expected = createPageData(repo.metadata(), query), actual = createPageData(repo.metadata(), query);
      expected.add(repo.sessions("local")[0]);
      await readSessionSlices(db, "local", query.start, query.end, false, null, row => actual.add(JSON.parse(row.snapshot_json)), false, { aggregate: true });
      const raw = expected.finish().sessions[0].summary, grouped = actual.finish().sessions[0].summary;
      near(grouped.cost.cost, raw.cost.cost);
      near(grouped.credits.credits, raw.credits.credits);
      assert.equal(grouped.cost.ultrafastCalls, 3);
      assert.equal(grouped.credits.unratedCalls, 6);
      assert.deepEqual(grouped.profiles, raw.profiles);
    }
  } finally { db.close(); }
});

test("quota capacity uses 8x Ultrafast weighting while monetary totals use 6x", () => {
  const now = new Date("2026-10-09T18:00:00Z");
  const quota = { startsAt: "2026-10-08T00:00:00Z", resetsAt: "2026-10-15T00:00:00Z", observedAt: now.toISOString(), peakObservedAt: now.toISOString(), usedPercent: 30, peakUsedPercent: 30, planType: "pro", windowMinutes: 10080 };
  const calls = [call(undefined, "standard", "2026-10-09T08:00:00Z"), call(undefined, "ultrafast", "2026-10-09T12:00:00Z")];
  const builder = createQuotaDetail({ weeklyQuota: quota, weeklyQuotaHistory: [quota], sessions: [] }, quota.resetsAt, now);
  calls.forEach(value => builder.add(value));
  const forecast = builder.finish().quotaDetail.forecast;
  assert.equal(forecast.status, "ready");
  near(forecast.capacityCredits, 7.75 * 9 * 100 / 30);
  near(codexCreditsOfCalls(calls).credits, 7.75 * 7);
});
