import { PRICING_CATALOG, PRICING_CATALOG_VERSION, PRICING_VERIFIED_AT, resolveRate, canonicalServiceTier, serviceTierRate } from "./pricing-catalog.js";

export const CODEX_CREDIT_RATES = Object.freeze(Object.fromEntries(PRICING_CATALOG
  .filter((rate) => rate.billing === "credits" && !rate.effectiveTo)
  .map((rate) => [rate.model, rate.standard])));

export function isFastServiceTier(serviceTier) { return serviceTier === "priority" || serviceTier === "fast"; }

export function creditRateFor(model = "", timestamp = null) {
  const resolved = resolveRate("credits", model, timestamp, { mode: timestamp ? "historical" : "current", asOf: PRICING_VERIFIED_AT });
  return resolved.rate ? { ...resolved.rate.standard, key: resolved.key } : null;
}

export function fastMultiplierFor(model, serviceTier, timestamp = null) {
  const resolved = resolveRate("credits", model, timestamp, { mode: timestamp ? "historical" : "current", asOf: PRICING_VERIFIED_AT });
  return serviceTierRate(resolved.rate, serviceTier, resolved.day).multiplier;
}

export function compareUsageProfiles(left, right) {
  const rank = { ultrafast: 3, fast: 2, standard: 1 };
  return right.calls - left.calls || (rank[right.tier] || 0) - (rank[left.tier] || 0) ||
    left.model.localeCompare(right.model) || String(left.effort).localeCompare(String(right.effort)) || left.tier.localeCompare(right.tier);
}

export function usageProfilesOfCalls(calls = []) {
  const profiles = new Map();
  for (const call of calls) {
    const model = String(call.model || "unknown");
    const effort = call.effort ? String(call.effort).toLowerCase() : null;
    const multiplier = fastMultiplierFor(model, call.serviceTier, call.timestamp);
    const fast = isFastServiceTier(call.serviceTier);
    const tier = canonicalServiceTier(call.serviceTier);
    const key = JSON.stringify([model, effort, tier, multiplier]);
    const profile = profiles.get(key) || { model, effort, multiplier, fast, tier, calls: 0 };
    profile.calls += 1;
    profiles.set(key, profile);
  }
  return [...profiles.values()].sort(compareUsageProfiles);
}

// Quota calibration uses subscription consumption; displays/exports use credits.
export function codexCreditsOfCalls(calls = [], { billing = "credits" } = {}) {
  const result = { credits: 0, standardCredits: 0, fastPremiumCredits: 0, fastCalls: 0, ultrafastPremiumCredits: 0, ultrafastCalls: 0, unratedCalls: 0, ratedCalls: 0, estimatedCalls: 0, boundaryCalls: 0, totalCalls: calls.length, catalogVersion: PRICING_CATALOG_VERSION, ratesUsed: {}, usageByRate: {}, unratedReasons: {} };
  const omit = (reason) => { result.unratedCalls += 1; result.unratedReasons[reason] = (result.unratedReasons[reason] || 0) + 1; };
  for (const call of calls) {
    const resolved = resolveRate("credits", call.model, call.timestamp);
    if (!resolved.rate) { omit(resolved.reason); continue; }
    const rate = resolved.rate;
    const usage = call.usage || {};
    const counters = [usage.inputTokens ?? 0, usage.cachedInputTokens ?? 0, usage.outputTokens ?? 0];
    if (counters.some((value) => !Number.isFinite(value) || value < 0) || counters[1] > counters[0]) { omit("invalid-usage"); continue; }
    const [input, cached, output] = counters;
    const writes = usage.cacheWriteInputTokens ?? 0;
    if (!Number.isFinite(writes) || writes < 0 || cached + writes > input) { omit("invalid-usage"); continue; }
    const speed = serviceTierRate(rate, call.serviceTier, resolved.day, { billing });
    const { tier, multiplier } = speed;
    if (!multiplier) { omit(speed.reason); continue; }
    const fast = tier === "fast";
    const standard = ((input - cached) * rate.standard.input + cached * rate.standard.cached + output * rate.standard.output) / 1_000_000;
    result.standardCredits += standard;
    result.credits += standard * multiplier;
    if (fast) result.fastPremiumCredits += standard * (multiplier - 1);
    if (tier === "ultrafast") { result.ultrafastCalls += 1; result.ultrafastPremiumCredits += standard * (multiplier - 1); }
    result.ratedCalls += 1;
    if (fast) result.fastCalls += 1;
    if (resolved.boundaryDay || speed.boundaryDay) result.boundaryCalls += 1;
    if (resolved.boundaryDay || speed.boundaryDay || speed.reconstructed || rate.evidence === "reconstructed") result.estimatedCalls += 1;
    result.ratesUsed[rate.id] = (result.ratesUsed[rate.id] || 0) + 1;
    const bucket = result.usageByRate[`${rate.id}:${tier}:${billing}`] ||= {
      rateId: rate.id, serviceTier: tier, billing, calls: 0, freshInputTokens: 0, cachedInputTokens: 0, outputTokens: 0,
      appliedRates: { input: rate.standard.input * multiplier, cached: rate.standard.cached * multiplier, output: rate.standard.output * multiplier },
    };
    bucket.calls += 1; bucket.freshInputTokens += input - cached; bucket.cachedInputTokens += cached; bucket.outputTokens += output;
  }
  result.complete = result.unratedCalls === 0;
  return result;
}
