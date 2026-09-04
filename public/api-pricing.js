import { PRICING_CATALOG, PRICING_CATALOG_VERSION, PRICING_VERIFIED_AT, canonicalPricingModel, resolveRate } from "./pricing-catalog.js";

const latest = PRICING_CATALOG.filter((rate) => rate.billing === "api" && !rate.effectiveTo);
export const DEFAULT_API_PRICING = Object.freeze({
  schemaVersion: 2, mode: "historical",
  reference: Object.freeze({ input: 4, cached: 0.4, output: 20, label: "GPT-5.6 Sol" }),
  models: Object.freeze(Object.fromEntries(latest.map((rate) => [rate.model, rate.standard]))),
  fastMultipliers: Object.freeze(Object.fromEntries(latest.filter((rate) => rate.fastMultiplier).map((rate) => [rate.model, rate.fastMultiplier]))),
  effortOverrides: Object.freeze({}),
});

function validPrice(value) {
  return value && ["input", "cached", "output"].every((key) => value[key] === null || (typeof value[key] === "number" && Number.isFinite(value[key]) && value[key] >= 0));
}
function validPrices(values) {
  return Object.fromEntries(Object.entries(values && typeof values === "object" ? values : {}).filter(([, value]) => validPrice(value)).map(([key, value]) => [key, { input: value.input, cached: value.cached, output: value.output }]));
}

export function mergeApiPricing(saved = {}) {
  if (!saved || typeof saved !== "object") saved = {};
  const legacy = saved.schemaVersion !== 2 && Object.keys(saved).length > 0;
  return {
    schemaVersion: 2,
    mode: !legacy && ["historical", "current", "custom"].includes(saved.mode) ? saved.mode : "historical",
    asOf: typeof saved.asOf === "string" && Number.isFinite(Date.parse(saved.asOf)) ? saved.asOf : new Date().toISOString(),
    legacyCustom: Boolean(legacy || saved.legacyCustom),
    reference: validPrice(saved.reference) ? { ...saved.reference } : { ...DEFAULT_API_PRICING.reference },
    models: { ...DEFAULT_API_PRICING.models, ...validPrices(saved.models) },
    fastMultipliers: { ...DEFAULT_API_PRICING.fastMultipliers, ...Object.fromEntries(Object.entries(saved.fastMultipliers || {}).filter(([, value]) => Number.isFinite(value) && value >= 1)) },
    effortOverrides: validPrices(saved.effortOverrides),
  };
}

export function apiPriceFor(pricing, model, effort = null) {
  const key = canonicalPricingModel(model);
  const override = pricing.mode === "custom" && effort && pricing.effortOverrides?.[`${model}::${effort}`];
  const rate = resolveRate("api", model, null, { mode: "current", asOf: pricing.asOf || PRICING_VERIFIED_AT }).rate;
  const custom = pricing.mode === "custom" && (pricing.models?.[model] || pricing.models?.[key]);
  const values = override || custom || rate?.standard || pricing.reference;
  return { ...values, exact: Boolean(rate && pricing.mode !== "custom"), key: override ? `${model}::${effort}` : rate || custom ? key : "reference" };
}

export function apiFastMultiplierFor(pricing, model, serviceTier, timestamp = null) {
  if (serviceTier !== "priority" && serviceTier !== "fast") return 1;
  const resolved = resolveRate("api", model, timestamp, { mode: timestamp ? pricing.mode : "current", asOf: pricing.asOf || PRICING_VERIFIED_AT });
  const custom = pricing.mode === "custom" && pricing.fastMultipliers?.[resolved.key];
  return custom || (resolved.rate?.fastFrom && resolved.day >= resolved.rate.fastFrom ? resolved.rate.fastMultiplier : null);
}

export function apiCostOfCalls(calls = [], pricing = mergeApiPricing()) {
  const result = {
    cost: 0, freshInputCost: 0, cachedInputCost: 0, cacheWriteCost: 0, outputCost: 0,
    standardCost: 0, fastPremiumCost: 0, fastCalls: 0, unsupportedFastCalls: 0,
    estimatedCalls: 0, unratedCalls: 0, missingTimestampCalls: 0, boundaryCalls: 0,
    longContextCalls: 0, unobservedCacheWriteCalls: 0, totalCalls: calls.length, ratedCalls: 0,
    catalogVersion: PRICING_CATALOG_VERSION, mode: pricing.mode, asOf: pricing.asOf,
    ratesUsed: {}, usageByRate: {}, unratedReasons: {},
  };
  const omit = (reason) => {
    result.unratedCalls += 1;
    result.unratedReasons[reason] = (result.unratedReasons[reason] || 0) + 1;
    if (reason === "missing-timestamp") result.missingTimestampCalls += 1;
    if (reason === "unsupported-fast") result.unsupportedFastCalls += 1;
  };
  for (const call of calls) {
    const usage = call.usage || {};
    const counters = [usage.inputTokens ?? 0, usage.cachedInputTokens ?? 0, usage.outputTokens ?? 0];
    if (counters.some((value) => !Number.isFinite(value) || value < 0) || counters[1] > counters[0]) { omit("invalid-usage"); continue; }
    const [input, cached, output] = counters;
    const writes = usage.cacheWriteInputTokens ?? 0;
    if (!Number.isFinite(writes) || writes < 0 || cached + writes > input) { omit("invalid-usage"); continue; }
    const fresh = input - cached - writes;
    const resolved = resolveRate("api", call.model, call.timestamp, { mode: pricing.mode === "custom" ? "current" : pricing.mode, asOf: pricing.asOf });
    const rate = resolved.rate;
    if (!rate && pricing.mode !== "custom") { omit(resolved.reason); continue; }
    const price = pricing.mode === "custom" ? apiPriceFor(pricing, call.model, call.effort) : rate.standard;
    if (writes > 0 && (!rate?.cacheWriteMultiplier || price.input === null)) { omit("unsupported-cache-write"); continue; }
    if ((fresh && price.input === null) || (cached && price.cached === null) || (output && price.output === null)) { omit("unsupported-token-type"); continue; }
    const longContext = Boolean(rate?.longContextThreshold && input > rate.longContextThreshold);
    const tier = call.serviceTier || "default";
    const fast = tier === "priority" || tier === "fast";
    if (!["default", "standard", "priority", "fast"].includes(tier)) { omit("unsupported-tier"); continue; }
    let multiplier = 1;
    if (fast) {
      multiplier = pricing.mode === "custom" ? pricing.fastMultipliers?.[resolved.key] : rate?.fastFrom && resolved.day >= rate.fastFrom ? rate.fastMultiplier : null;
      if (!multiplier || (longContext && (!rate?.fastLongContextFrom || resolved.day < rate.fastLongContextFrom))) { omit("unsupported-fast"); continue; }
    }
    const freshCost = fresh * (price.input || 0) * (longContext ? 2 : 1) / 1_000_000;
    const cachedCost = cached * (price.cached || 0) * (longContext ? 2 : 1) / 1_000_000;
    const writeCost = writes * (price.input || 0) * (rate?.cacheWriteMultiplier || 1) * (longContext ? 2 : 1) / 1_000_000;
    const outputCost = output * (price.output || 0) * (longContext ? 1.5 : 1) / 1_000_000;
    const standard = freshCost + cachedCost + writeCost + outputCost;
    result.freshInputCost += freshCost * multiplier;
    result.cachedInputCost += cachedCost * multiplier;
    result.cacheWriteCost += writeCost * multiplier;
    result.outputCost += outputCost * multiplier;
    result.standardCost += standard;
    result.cost += standard * multiplier;
    result.fastPremiumCost += standard * (multiplier - 1);
    result.ratedCalls += 1;
    if (fast) result.fastCalls += 1;
    if (longContext) result.longContextCalls += 1;
    if (rate?.cacheWriteMultiplier && !Object.hasOwn(usage, "cacheWriteInputTokens")) result.unobservedCacheWriteCalls += 1;
    const boundary = pricing.mode === "historical" && (resolved.boundaryDay || (fast && [rate.fastFrom, rate.fastLongContextFrom].includes(resolved.day)));
    if (boundary) result.boundaryCalls += 1;
    if (pricing.mode === "custom" || rate?.evidence === "reconstructed" || boundary) result.estimatedCalls += 1;
    const id = pricing.mode === "custom" ? `custom:${price.key}` : rate.id;
    result.ratesUsed[id] = (result.ratesUsed[id] || 0) + 1;
    const bucketKey = `${id}:${fast ? "fast" : "standard"}:${longContext ? "long" : "short"}`;
    const bucket = result.usageByRate[bucketKey] ||= {
      rateId: id, calls: 0, freshInputTokens: 0, cachedInputTokens: 0, cacheWriteInputTokens: 0, outputTokens: 0,
      appliedRates: { input: (price.input || 0) * (longContext ? 2 : 1) * multiplier, cached: (price.cached || 0) * (longContext ? 2 : 1) * multiplier, cacheWrite: (price.input || 0) * (rate?.cacheWriteMultiplier || 1) * (longContext ? 2 : 1) * multiplier, output: (price.output || 0) * (longContext ? 1.5 : 1) * multiplier },
    };
    bucket.calls += 1; bucket.freshInputTokens += fresh; bucket.cachedInputTokens += cached; bucket.cacheWriteInputTokens += writes; bucket.outputTokens += output;
  }
  result.officialCoverage = calls.length ? (result.ratedCalls - result.estimatedCalls) / calls.length : 1;
  result.complete = result.unratedCalls === 0;
  return result;
}
