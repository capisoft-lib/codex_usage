import assert from "node:assert/strict";
import test from "node:test";
import { codexCreditsOfCalls, creditRateFor, fastMultiplierFor, isFastServiceTier, usageProfilesOfCalls } from "../public/usage-pricing.js";

const usage = { inputTokens: 1_000, cachedInputTokens: 800, outputTokens: 100 };

test("applies the GPT-5.6 Sol Fast credit multiplier to priority calls", () => {
  const result = codexCreditsOfCalls([{ timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", serviceTier: "priority", usage }]);
  assert.equal(result.standardCredits, 0.11);
  assert.equal(result.credits, 0.275);
  assert.ok(Math.abs(result.fastPremiumCredits - 0.165) < 1e-12);
  assert.equal(result.fastCalls, 1);
  assert.equal(result.unratedCalls, 0);
});

test("keeps standard calls at the base Codex credit rate", () => {
  const result = codexCreditsOfCalls([{ timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", serviceTier: "default", usage }]);
  assert.equal(result.credits, 0.11);
  assert.equal(result.fastCalls, 0);
  assert.equal(result.fastPremiumCredits, 0);
});

test("supports documented tiers and does not invent rates for unknown models", () => {
  assert.equal(isFastServiceTier("fast"), true);
  assert.equal(isFastServiceTier("priority"), true);
  assert.equal(fastMultiplierFor("gpt-5.4", "priority"), 2);
  assert.equal(creditRateFor("gpt-5.6-sol-2026-08-01").key, "gpt-5.6-sol");
  const result = codexCreditsOfCalls([{ model: "private-model", serviceTier: "priority", usage }]);
  assert.equal(result.credits, 0);
  assert.equal(result.unratedCalls, 1);
});

test("aggregates model, effort and Fast multiplier into distinct usage profiles", () => {
  const profiles = usageProfilesOfCalls([
    { timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", effort: "high", serviceTier: "default" },
    { timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", effort: "xhigh", serviceTier: "priority" },
    { timestamp: "2026-08-14T12:00:00Z", model: "gpt-5.6-sol", effort: "xhigh", serviceTier: "priority" },
  ]);

  assert.deepEqual(profiles, [
    { model: "gpt-5.6-sol", effort: "xhigh", multiplier: 2.5, fast: true, calls: 2 },
    { model: "gpt-5.6-sol", effort: "high", multiplier: 1, fast: false, calls: 1 },
  ]);
});
