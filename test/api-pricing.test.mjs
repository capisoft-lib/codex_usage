import test from "node:test";
import assert from "node:assert/strict";
import { apiCostOfCalls, apiFastMultiplierFor, apiPriceFor, mergeApiPricing } from "../public/api-pricing.js";

const usage = (inputTokens, cachedInputTokens, outputTokens) => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
});

test("recognizes current GPT-5.6 Sol pricing without a fallback", () => {
  const pricing = mergeApiPricing();
  assert.deepEqual(apiPriceFor(pricing, "gpt-5.6-sol"), {
    input: 4,
    cached: 0.4,
    output: 20,
    exact: true,
    key: "gpt-5.6-sol",
  });
});

test("separates fresh, cached, and output cost", () => {
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol",
    usage: usage(200_000, 160_000, 20_000),
  }], mergeApiPricing());

  assert.equal(result.freshInputCost, 0.2);
  assert.equal(result.cachedInputCost, 0.08);
  assert.equal(result.outputCost, 0.6);
  assert.equal(result.cost, 0.88);
  assert.equal(result.estimatedCalls, 0);
  assert.equal(result.officialCoverage, 1);
});

test("applies GPT-5.6 long-context input and output multipliers", () => {
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol",
    usage: usage(300_000, 0, 10_000),
  }], mergeApiPricing());

  assert.equal(result.freshInputCost, 3);
  assert.equal(result.outputCost, 0.45);
  assert.equal(result.cost, 3.45);
  assert.equal(result.longContextCalls, 1);
});

test("applies the official API Fast rate instead of the ChatGPT credit multiplier", () => {
  const pricing = mergeApiPricing();
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol",
    serviceTier: "priority",
    usage: usage(200_000, 160_000, 20_000),
  }], pricing);

  assert.equal(apiFastMultiplierFor(pricing, "gpt-5.6-sol", "priority"), 2);
  assert.equal(apiFastMultiplierFor(pricing, "gpt-5.6-sol", "fast"), 2);
  assert.equal(result.standardCost, 0.88);
  assert.equal(result.fastPremiumCost, 0.88);
  assert.equal(result.cost, 1.76);
  assert.equal(result.fastCalls, 1);
  assert.equal(result.unsupportedFastCalls, 0);
});

test("combines Fast and long-context API surcharges", () => {
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-terra",
    serviceTier: "fast",
    usage: usage(300_000, 0, 10_000),
  }], mergeApiPricing());

  assert.equal(result.standardCost, 1.38);
  assert.equal(result.fastPremiumCost, 1.38);
  assert.equal(result.cost, 2.76);
  assert.equal(result.freshInputCost, 2.4);
  assert.equal(result.outputCost, 0.36);
  assert.equal(result.fastCalls, 1);
  assert.equal(result.longContextCalls, 1);
});

test("does not invent an API Fast rate for models without a documented one", () => {
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.5",
    serviceTier: "priority",
    usage: usage(1_000_000, 0, 0),
  }], mergeApiPricing());

  assert.equal(result.cost, 0);
  assert.equal(result.unratedCalls, 1);
  assert.equal(result.longContextCalls, 0);
  assert.equal(result.fastCalls, 0);
  assert.equal(result.unsupportedFastCalls, 1);
});

test("uses exact API rates for every model in the Codex credit rate card", () => {
  const pricing = mergeApiPricing();
  assert.equal(apiPriceFor(pricing, "gpt-5.4-mini").input, 0.75);
  assert.equal(apiPriceFor(pricing, "gpt-5.3-codex").output, 14);
});

test("does not apply the long-context surcharge to GPT-5.4 mini", () => {
  const result = apiCostOfCalls([{
    timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.4-mini",
    usage: usage(300_000, 0, 10_000),
  }], mergeApiPricing());

  assert.equal(result.cost, 0.27);
  assert.equal(result.longContextCalls, 0);
});

test("merges stored overrides while adding newly supported models", () => {
  const pricing = mergeApiPricing({ models: { "custom-model": { input: 1, cached: 0.1, output: 2 } } });
  assert.equal(pricing.models["gpt-5.6-sol"].input, 4);
  assert.equal(pricing.models["custom-model"].output, 2);
});

test("reports unrated coverage for unknown models", () => {
  const result = apiCostOfCalls([
    { timestamp: "2026-08-14T12:00:00Z", model: "unknown-model", usage: usage(1_000_000, 0, 0) },
    { timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", usage: usage(1_000_000, 0, 0) },
  ], mergeApiPricing());
  assert.equal(result.unratedCalls, 1);
  assert.equal(result.officialCoverage, 0.5);
});
