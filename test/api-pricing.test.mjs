import test from "node:test";
import assert from "node:assert/strict";
import { apiCostOfCalls, apiPriceFor, mergeApiPricing } from "../public/api-pricing.js";

const usage = (inputTokens, cachedInputTokens, outputTokens) => ({
  inputTokens,
  cachedInputTokens,
  outputTokens,
});

test("recognizes current GPT-5.6 Sol pricing without a fallback", () => {
  const pricing = mergeApiPricing();
  assert.deepEqual(apiPriceFor(pricing, "gpt-5.6-sol"), {
    input: 5,
    cached: 0.5,
    output: 30,
    exact: true,
    key: "gpt-5.6-sol",
  });
});

test("separates fresh, cached, and output cost", () => {
  const result = apiCostOfCalls([{
    model: "gpt-5.6-sol",
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
    model: "gpt-5.6-sol",
    usage: usage(300_000, 0, 10_000),
  }], mergeApiPricing());

  assert.equal(result.freshInputCost, 3);
  assert.equal(result.outputCost, 0.45);
  assert.equal(result.cost, 3.45);
  assert.equal(result.longContextCalls, 1);
});

test("merges stored overrides while adding newly supported models", () => {
  const pricing = mergeApiPricing({ models: { "custom-model": { input: 1, cached: 0.1, output: 2 } } });
  assert.equal(pricing.models["gpt-5.6-sol"].input, 5);
  assert.equal(pricing.models["custom-model"].output, 2);
});

test("reports reference-rate coverage for unknown models", () => {
  const result = apiCostOfCalls([
    { model: "unknown-model", usage: usage(1_000_000, 0, 0) },
    { model: "gpt-5.6-sol", usage: usage(1_000_000, 0, 0) },
  ], mergeApiPricing());
  assert.equal(result.estimatedCalls, 1);
  assert.equal(result.officialCoverage, 0.5);
});
