// Official API text-token prices per 1M tokens, checked 2026-08-11.
// Source: https://developers.openai.com/api/docs/models/compare
export const DEFAULT_API_PRICING = Object.freeze({
  reference: Object.freeze({ input: 5, cached: 0.5, output: 30, label: "GPT-5.6 Sol" }),
  models: Object.freeze({
    "gpt-5.6-sol": Object.freeze({ input: 5, cached: 0.5, output: 30 }),
    "gpt-5.6-terra": Object.freeze({ input: 2, cached: 0.2, output: 12 }),
    "gpt-5.6-luna": Object.freeze({ input: 0.2, cached: 0.02, output: 1.2 }),
    "gpt-5.5": Object.freeze({ input: 5, cached: 0.5, output: 30 }),
    "gpt-5.5-pro": Object.freeze({ input: 30, cached: 30, output: 180 }),
    "gpt-5.4": Object.freeze({ input: 2.5, cached: 0.25, output: 15 }),
    "gpt-5.4-pro": Object.freeze({ input: 30, cached: 30, output: 180 }),
    "gpt-5.2": Object.freeze({ input: 1.75, cached: 0.175, output: 14 }),
    "gpt-5": Object.freeze({ input: 1.25, cached: 0.125, output: 10 }),
  }),
  effortOverrides: Object.freeze({}),
});

export function mergeApiPricing(saved = {}) {
  return {
    reference: { ...DEFAULT_API_PRICING.reference, ...(saved.reference || {}) },
    models: { ...DEFAULT_API_PRICING.models, ...(saved.models || {}) },
    effortOverrides: { ...(saved.effortOverrides || {}) },
  };
}

function modelPriceFor(pricing, model) {
  const normalized = String(model || "unknown").toLowerCase();
  if (pricing.models[normalized]) return { ...pricing.models[normalized], exact: true, key: normalized };
  const key = Object.keys(pricing.models)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`));
  return key
    ? { ...pricing.models[key], exact: true, key }
    : { ...pricing.reference, exact: false, key: "reference" };
}

export function apiPriceFor(pricing, model, effort = null) {
  const override = effort && pricing.effortOverrides?.[`${model}::${effort}`];
  return override
    ? { ...override, exact: true, key: `${model}::${effort}` }
    : modelPriceFor(pricing, model);
}

function isLongContext(model, inputTokens) {
  return String(model || "").toLowerCase().startsWith("gpt-5.6") && inputTokens > 272_000;
}

export function apiCostOfCalls(calls = [], pricing = mergeApiPricing()) {
  const result = {
    cost: 0,
    freshInputCost: 0,
    cachedInputCost: 0,
    outputCost: 0,
    estimatedCalls: 0,
    longContextCalls: 0,
    totalCalls: calls.length,
  };

  for (const call of calls) {
    const usage = call.usage || {};
    const input = Math.max(0, Number(usage.inputTokens) || 0);
    const cached = Math.min(input, Math.max(0, Number(usage.cachedInputTokens) || 0));
    const output = Math.max(0, Number(usage.outputTokens) || 0);
    const fresh = input - cached;
    const price = apiPriceFor(pricing, call.model, call.effort);
    const longContext = isLongContext(call.model, input);
    const inputMultiplier = longContext ? 2 : 1;
    const outputMultiplier = longContext ? 1.5 : 1;

    const freshInputCost = fresh * price.input * inputMultiplier / 1_000_000;
    const cachedInputCost = cached * price.cached * inputMultiplier / 1_000_000;
    const outputCost = output * price.output * outputMultiplier / 1_000_000;
    result.freshInputCost += freshInputCost;
    result.cachedInputCost += cachedInputCost;
    result.outputCost += outputCost;
    result.cost += freshInputCost + cachedInputCost + outputCost;
    if (!price.exact) result.estimatedCalls += 1;
    if (longContext) result.longContextCalls += 1;
  }

  result.officialCoverage = result.totalCalls
    ? (result.totalCalls - result.estimatedCalls) / result.totalCalls
    : 1;
  return result;
}
