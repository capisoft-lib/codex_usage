import assert from "node:assert/strict";
import test from "node:test";
import { buildQuotaForecast, measuredQuotaPace } from "../public/quota-forecast.js";
import { createPricingReport, pricingDiagnosticsMarkup, PRICING_I18N } from "../public/pricing-ui.js";
import { mergeApiPricing } from "../public/api-pricing.js";

const time = h => new Date(Date.parse("2026-09-05T13:52:00Z") + h * 3600000).toISOString();
const points = hours => hours.map(h => ({ timestamp: time(h), percent: h }));
const options = {
  rangeStart: time(0), rangeEnd: time(168), observedAt: time(56), asOf: time(56), usedPercent: 56,
  observations: points([0, 12, 24, 36, 48, 56]).map(p => ({ observedAt: p.timestamp, usedPercent: p.percent })),
  samples: Array.from({ length: 869 }, () => ({ timestamp: time(50), value: 0, rated: false })),
};

test("869 unrated calls no longer block projection with measured quota history", () => {
  const original = structuredClone(options);
  const result = buildQuotaForecast(options);
  assert.equal(result.calibrationSource, "observations");
  assert.equal(result.projectionUnavailable, false);
  assert.ok(Math.abs(result.expectedFinalPercent - 168) < 1e-10);
  assert.equal(result.creditsPerHour, undefined);
  assert.equal(result.percentPerHour, 1);
  assert.deepEqual(result.projected[0], result.actual.at(-1));
  assert.deepEqual(options, original);
  const partialCalibration = buildQuotaForecast({ ...options, capacityCredits: 10000, samples: [{ timestamp: time(56), rated: false }] });
  assert.equal(partialCalibration.calibrationSource, "observations");
});

test("time-weighted quota pace is invariant to polling density and favors recent activity", () => {
  assert.equal(measuredQuotaPace(points([0, 12, 24]), time(24)).percentPerHour, 1);
  assert.equal(measuredQuotaPace(points([0, 1, 2, 3, 12, 24]), time(24)).percentPerHour, 1);
  const recent = [{ timestamp: time(0), percent: 0 }, { timestamp: time(12), percent: 0 }, { timestamp: time(24), percent: 24 }];
  assert.ok(measuredQuotaPace(recent, time(24)).percentPerHour > 1);
  assert.equal(measuredQuotaPace(points([0, 1]), time(1), 1).percentPerHour, 1);
});

test("observation recovery does not use artificial plateau, stale data or old reset segments", () => {
  assert.equal(buildQuotaForecast({ ...options, asOf: time(81) }).reason, "stale-observations");
  const delayed = buildQuotaForecast({ ...options, asOf: time(60) });
  assert.equal(delayed.percentPerHour, 1);
  assert.equal(delayed.observedAt, time(56));
  assert.deepEqual(delayed.projected[0], { timestamp: time(60), percent: 56 });
  const reset = [{ timestamp: time(0), percent: 80 }, { timestamp: time(1), percent: 1 }, { timestamp: time(2), percent: 2 }];
  assert.equal(measuredQuotaPace(reset, time(2)).percentPerHour, 1);
  assert.equal(measuredQuotaPace(reset.slice(0, 2), time(2)).reason, "short-observation-history");
  assert.equal(measuredQuotaPace(points([0, 30, 30.5]), time(30.5)).reason, "short-observation-history");
  assert.equal(measuredQuotaPace(points([0, 30, 31]), time(31)).percentPerHour, 1);
  const one = buildQuotaForecast({ ...options, observations: [options.observations.at(-1)] });
  assert.equal(one.reason, "short-observation-history");
  assert.equal(one.projected.length, 0);
  assert.equal(buildQuotaForecast({ ...options, usedPercent: 55 }).reason, "inconsistent-observations");
  assert.equal(buildQuotaForecast({ ...options, project: false }).projected.length, 0);
});

test("pricing report identifies rejected known-model calls and escapes diagnostic metadata", () => {
  const calls = [
    { model: "gpt-6-astra", timestamp: time(1), usage: { inputTokens: 10, cachedInputTokens: 20 } },
    { model: "gpt-6-astra", timestamp: time(2), usage: { inputTokens: 10, cachedInputTokens: 20 } },
    { model: '<img src=x onerror=alert(1)>', timestamp: time(2), serviceTier: "default", prompt: "PRIVATE_CONTENT", cwd: "PRIVATE_PATH" },
    { model: "gpt-6-astra", timestamp: "2026-08-01", usage: {} },
  ];
  const report = createPricingReport(calls, mergeApiPricing());
  const group = report.diagnostics.find(g => g.billing === "credits" && g.reason === "invalid-usage");
  assert.equal(group.calls, 2);
  assert.equal(group.model, "gpt-6-astra");
  assert.equal(report.credits.unratedReasons["uncovered-date"], 1);
  assert.ok(!JSON.stringify(report).includes("PRIVATE_"));
  const markup = pricingDiagnosticsMarkup(k => PRICING_I18N.en[k] || k, calls, mergeApiPricing());
  assert.ok(markup.includes("Inconsistent token counters"));
  assert.ok(!markup.includes("<img"));
});
