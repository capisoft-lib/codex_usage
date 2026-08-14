import assert from "node:assert/strict";
import test from "node:test";
import { buildQuotaForecast, exponentialWeightedAverage, FORECAST_HOUR_MS, weeklyForecastTicks } from "../public/quota-forecast.js";

test("exponential weighting gives more influence to recent credit consumption", () => {
  const olderSpike = exponentialWeightedAverage([100, 0, 0, 0], 2);
  const recentSpike = exponentialWeightedAverage([0, 0, 0, 100], 2);
  assert.ok(recentSpike > olderSpike);
});

test("weekly forecast exposes one vertical boundary for every day", () => {
  const start = Date.parse("2026-08-13T03:29:39.000Z");
  const ticks = weeklyForecastTicks(start, start + 7 * 24 * FORECAST_HOUR_MS);
  assert.equal(ticks.length, 8);
  assert.deepEqual(ticks.slice(1).map((tick, index) => tick - ticks[index]), Array(7).fill(24 * FORECAST_HOUR_MS));
});

test("forecast calibrates the EMA credit pace to the observed Codex quota", () => {
  const observedAt = Date.parse("2026-08-14T12:00:00.000Z");
  const samples = Array.from({ length: 84 }, (_, index) => ({
    timestamp: new Date(observedAt - (index + 0.5) * FORECAST_HOUR_MS).toISOString(),
    value: 1,
  }));
  const forecast = buildQuotaForecast({
    samples,
    rangeStart: new Date(observedAt - 84 * FORECAST_HOUR_MS),
    rangeEnd: new Date(observedAt + 84 * FORECAST_HOUR_MS),
    observedAt: new Date(observedAt),
    usedPercent: 50,
  });

  assert.equal(forecast.status, "ready");
  assert.ok(Math.abs(forecast.creditsPerHour - 1) < 0.000001);
  assert.ok(Math.abs(forecast.expectedFinalPercent - 100) < 0.000001);
  assert.equal(forecast.actual.at(-1).percent, 50);
  assert.equal(forecast.projected.at(-1).percent, forecast.expectedFinalPercent);
});

test("the same consumed credits produce a higher forecast when they are recent", () => {
  const observedAt = Date.parse("2026-08-14T12:00:00.000Z");
  const common = {
    rangeStart: new Date(observedAt - 120 * FORECAST_HOUR_MS),
    rangeEnd: new Date(observedAt + 48 * FORECAST_HOUR_MS),
    observedAt: new Date(observedAt),
    usedPercent: 40,
  };
  const older = buildQuotaForecast({ ...common, samples: [{ timestamp: new Date(observedAt - 100 * FORECAST_HOUR_MS), value: 80 }] });
  const recent = buildQuotaForecast({ ...common, samples: [{ timestamp: new Date(observedAt - FORECAST_HOUR_MS / 2), value: 80 }] });

  assert.equal(older.status, "ready");
  assert.equal(recent.status, "ready");
  assert.ok(recent.expectedFinalPercent > older.expectedFinalPercent);
});

test("forecast fails closed when quota calibration data is unavailable", () => {
  const common = {
    rangeStart: "2026-08-13T12:00:00.000Z",
    rangeEnd: "2026-08-20T12:00:00.000Z",
    observedAt: "2026-08-14T12:00:00.000Z",
  };
  assert.equal(buildQuotaForecast({ ...common, usedPercent: null }).status, "insufficient");
  assert.equal(buildQuotaForecast({ ...common, usedPercent: 20, samples: [] }).status, "insufficient");
  assert.equal(buildQuotaForecast({ ...common, usedPercent: 20, observedAt: "broken" }).status, "unavailable");
});
