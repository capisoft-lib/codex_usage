import assert from "node:assert/strict";
import test from "node:test";
import { apiCostOfCalls } from "../public/api-pricing.js";
import { codexCreditsOfCalls } from "../public/usage-pricing.js";

const usage = { inputTokens: 200000, cachedInputTokens: 100000, cacheWriteInputTokens: 40000, outputTokens: 10000 };
const call = (changes = {}) => ({ model: "gpt-6.1-terra", timestamp: "2026-10-28T00:00:00Z", serviceTier: "default", usage, ...changes });
const near = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("Terra API and credit rates, speed factors, and conservative date boundaries", () => {
  near(apiCostOfCalls([call()]).cost, 0.165);
  near(apiCostOfCalls([call({serviceTier:"fast"})]).cost, 0.33);
  near(codexCreditsOfCalls([call()]).credits, 3.875);
  near(codexCreditsOfCalls([call({serviceTier:"fast"})]).credits, 7.75);
  near(codexCreditsOfCalls([call({serviceTier:"fast"})], {billing:"subscription"}).credits, 9.6875);
  assert.equal(apiCostOfCalls([call({timestamp:"2026-10-25T23:59:59Z"})]).unratedCalls, 1);
  assert.equal(codexCreditsOfCalls([call({timestamp:"2026-10-26T12:00:00Z"})]).unratedCalls, 1);
  for (const calculator of [apiCostOfCalls, codexCreditsOfCalls]) {
    assert.equal(calculator([call({serviceTier:"ultrafast"})]).unratedCalls, 1);
    assert.equal(calculator([call({model:"gpt-6.1-terra-private"})]).unratedCalls, 1);
  }
});

test("Terra long context stacks with Fast, and API discounts remain separate from credits", () => {
  const tokens = n => ({inputTokens:n,cachedInputTokens:0,cacheWriteInputTokens:0,outputTokens:0});
  near(apiCostOfCalls([call({usage:tokens(272000)})]).cost, 0.272);
  near(apiCostOfCalls([call({usage:tokens(272001),serviceTier:"fast"})]).cost, 1.088004);
  for (const serviceTier of ["batch", "flex"]) {
    near(apiCostOfCalls([call({serviceTier})]).cost, 0.0825);
    assert.equal(codexCreditsOfCalls([call({serviceTier})]).unratedCalls, 1);
  }
});
