// Official ChatGPT Codex credit rates per 1M tokens, verified 2026-08-11:
// https://learn.chatgpt.com/docs/pricing
export const CODEX_CREDIT_RATES = Object.freeze({
  "gpt-5.6-sol": { input: 125, cached: 12.5, output: 750 },
  "gpt-5.6-terra": { input: 50, cached: 5, output: 300 },
  "gpt-5.6-luna": { input: 5, cached: 0.5, output: 30 },
  "gpt-5.5": { input: 125, cached: 12.5, output: 750 },
  "gpt-5.4-mini": { input: 18.75, cached: 1.875, output: 113 },
  "gpt-5.4": { input: 62.5, cached: 6.25, output: 375 },
  "gpt-5.3-codex": { input: 43.75, cached: 4.375, output: 350 },
  "gpt-5.2": { input: 43.75, cached: 4.375, output: 350 },
});

export function isFastServiceTier(serviceTier) {
  return serviceTier === "priority" || serviceTier === "fast";
}

export function creditRateFor(model = "") {
  const normalized = String(model).toLowerCase();
  const key = Object.keys(CODEX_CREDIT_RATES)
    .sort((left, right) => right.length - left.length)
    .find((candidate) => normalized === candidate || normalized.startsWith(`${candidate}-`));
  return key ? { ...CODEX_CREDIT_RATES[key], key } : null;
}

export function fastMultiplierFor(model, serviceTier) {
  if (!isFastServiceTier(serviceTier)) return 1;
  const normalized = String(model || "").toLowerCase();
  if (normalized.startsWith("gpt-5.6") || normalized.startsWith("gpt-5.5")) return 2.5;
  if (normalized.startsWith("gpt-5.4")) return 2;
  return 1;
}

export function usageProfilesOfCalls(calls = []) {
  const profiles = new Map();
  for (const call of calls) {
    const model = String(call.model || "unknown");
    const effort = call.effort ? String(call.effort).toLowerCase() : null;
    const multiplier = fastMultiplierFor(model, call.serviceTier);
    const key = JSON.stringify([model, effort, multiplier]);
    const profile = profiles.get(key) || { model, effort, multiplier, fast: multiplier > 1, calls: 0 };
    profile.calls += 1;
    profiles.set(key, profile);
  }
  return [...profiles.values()].sort((left, right) =>
    right.calls - left.calls
    || Number(right.fast) - Number(left.fast)
    || left.model.localeCompare(right.model)
    || String(left.effort).localeCompare(String(right.effort))
  );
}

export function codexCreditsOfCalls(calls = []) {
  let credits = 0;
  let standardCredits = 0;
  let fastCalls = 0;
  let unratedCalls = 0;

  for (const call of calls) {
    const rate = creditRateFor(call.model);
    if (!rate) {
      unratedCalls += 1;
      continue;
    }
    const usage = call.usage || {};
    const input = Number(usage.inputTokens) || 0;
    const cached = Number(usage.cachedInputTokens) || 0;
    const output = Number(usage.outputTokens) || 0;
    const fresh = Math.max(0, input - cached);
    const standard = (fresh * rate.input + cached * rate.cached + output * rate.output) / 1_000_000;
    const multiplier = fastMultiplierFor(call.model, call.serviceTier);
    standardCredits += standard;
    credits += standard * multiplier;
    if (multiplier > 1) fastCalls += 1;
  }

  return {
    credits,
    standardCredits,
    fastPremiumCredits: credits - standardCredits,
    fastCalls,
    unratedCalls,
  };
}
