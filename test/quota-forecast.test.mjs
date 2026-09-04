import assert from "node:assert/strict";
import test from "node:test";
import { buildQuotaForecast, estimateQuotaCapacityCredits, exponentialWeightedAverage, FORECAST_HOUR_MS, interpolateForecastPercent, weeklyForecastTicks } from "../public/quota-forecast.js";

test("exponential weighting gives more influence to recent credit consumption", () => {
  const olderSpike = exponentialWeightedAverage([100, 0, 0, 0], 2);
  const recentSpike = exponentialWeightedAverage([0, 0, 0, 100], 2);
  assert.ok(recentSpike > olderSpike);
});

test("weekly forecast vertical guides follow local midnight instead of the quota start hour", () => {
  const start = new Date(2026, 7, 25, 16, 13).getTime();
  const ticks = weeklyForecastTicks(start, start + 7 * 24 * FORECAST_HOUR_MS);
  assert.equal(ticks.length, 7);
  assert.ok(ticks.every((tick) => {
    const date = new Date(tick);
    return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
  }));
  assert.equal(new Date(ticks[0]).getDate(), 26);
  assert.equal(new Date(ticks.at(-1)).getDate(), 1);
});

test("forecast hover values interpolate the curve at the axis date", () => {
  const points = [
    { timestamp: "2026-08-20T07:00:00.000Z", percent: 10 },
    { timestamp: "2026-08-20T09:00:00.000Z", percent: 30 },
  ];
  assert.equal(interpolateForecastPercent(points, "2026-08-20T08:00:00.000Z"), 20);
  assert.equal(interpolateForecastPercent(points, "2026-08-20T06:00:00.000Z"), 10);
  assert.equal(interpolateForecastPercent(points, "2026-08-20T10:00:00.000Z"), 30);
  assert.equal(interpolateForecastPercent([], "2026-08-20T08:00:00.000Z"), null);
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

test("a stale quota observation stays flat through the current chart date", () => {
  const rangeStart = Date.parse("2026-08-24T04:34:00.000Z");
  const observedAt = Date.parse("2026-08-25T10:00:00.000Z");
  const asOf = Date.parse("2026-08-26T08:00:00.000Z");
  const rangeEnd = rangeStart + 7 * 24 * FORECAST_HOUR_MS;
  const forecast = buildQuotaForecast({
    samples: [{ timestamp: new Date(observedAt - FORECAST_HOUR_MS).toISOString(), value: 12 }],
    rangeStart,
    rangeEnd,
    observedAt,
    asOf,
    usedPercent: 12,
  });

  assert.equal(forecast.status, "ready");
  assert.equal(forecast.observedAt, new Date(observedAt).toISOString());
  assert.equal(forecast.asOf, new Date(asOf).toISOString());
  assert.deepEqual(forecast.actual.slice(-2), [
    { timestamp: new Date(observedAt).toISOString(), percent: 12 },
    { timestamp: new Date(asOf).toISOString(), percent: 12 },
  ]);
  assert.equal(forecast.projected[0].timestamp, new Date(asOf).toISOString());
});

test("a new quota uses historical capacity and recent EMA consumption immediately", () => {
  const rangeStart = Date.parse("2026-08-20T05:00:00.000Z");
  const observedAt = rangeStart + FORECAST_HOUR_MS / 2;
  const previousStart = rangeStart - 7 * 24 * FORECAST_HOUR_MS;
  const previousObservedAt = rangeStart - FORECAST_HOUR_MS;
  const samples = Array.from({ length: 50 }, (_, index) => ({
    timestamp: new Date(previousObservedAt - (49 - index) * FORECAST_HOUR_MS).toISOString(),
    value: 1,
  }));
  const capacityCredits = estimateQuotaCapacityCredits({
    samples,
    quotaPeriods: [{
      startsAt: new Date(previousStart).toISOString(),
      peakObservedAt: new Date(previousObservedAt).toISOString(),
      peakUsedPercent: 50,
      planType: "pro",
    }],
    planType: "pro",
  });
  const forecast = buildQuotaForecast({
    samples,
    rangeStart,
    rangeEnd: rangeStart + 7 * 24 * FORECAST_HOUR_MS,
    observedAt,
    usedPercent: 0,
    capacityCredits,
  });

  assert.equal(capacityCredits, 100);
  assert.equal(forecast.status, "ready");
  assert.equal(forecast.calibrationSource, "history");
  assert.equal(forecast.currentCredits, 0);
  assert.equal(forecast.actual.at(-1).percent, 0);
  assert.ok(forecast.creditsPerHour > 0);
  assert.ok(forecast.expectedFinalPercent > 0);
});

test("historical capacity ignores quota periods from another reported plan", () => {
  const start = Date.parse("2026-08-01T00:00:00.000Z");
  const samples = [
    { timestamp: new Date(start + FORECAST_HOUR_MS).toISOString(), value: 20 },
    { timestamp: new Date(start + 8 * 24 * FORECAST_HOUR_MS).toISOString(), value: 80 },
  ];
  const capacity = estimateQuotaCapacityCredits({
    samples,
    quotaPeriods: [
      { startsAt: new Date(start).toISOString(), peakObservedAt: new Date(start + 2 * FORECAST_HOUR_MS).toISOString(), peakUsedPercent: 20, planType: "pro" },
      { startsAt: new Date(start + 7 * 24 * FORECAST_HOUR_MS).toISOString(), peakObservedAt: new Date(start + 9 * 24 * FORECAST_HOUR_MS).toISOString(), peakUsedPercent: 20, planType: "plus" },
    ],
    planType: "pro",
  });

  assert.equal(capacity, 100);
});

test("a completed quota renders cumulative consumption through its effective end without projection", () => {
  const rangeStart = Date.parse("2026-08-12T17:23:48.000Z");
  const rangeEnd = Date.parse("2026-08-13T03:29:38.000Z");
  const forecast = buildQuotaForecast({
    samples: [
      { timestamp: new Date(rangeStart + FORECAST_HOUR_MS).toISOString(), value: 10 },
      { timestamp: new Date(rangeEnd - FORECAST_HOUR_MS).toISOString(), value: 20 },
    ],
    rangeStart,
    rangeEnd,
    observedAt: rangeEnd,
    usedPercent: 3,
    project: false,
  });

  assert.equal(forecast.status, "ready");
  assert.equal(forecast.completed, true);
  assert.equal(forecast.expectedFinalPercent, 3);
  assert.equal(forecast.actual.at(-1).timestamp, new Date(rangeEnd).toISOString());
  assert.equal(forecast.actual.at(-1).percent, 3);
  assert.deepEqual(forecast.projected, []);
});

test("forecast fails closed when quota calibration data is unavailable", () => {
  const common = {
    rangeStart: "2026-08-13T12:00:00.000Z",
    rangeEnd: "2026-08-20T12:00:00.000Z",
    observedAt: "2026-08-14T12:00:00.000Z",
  };
  assert.equal(buildQuotaForecast({ ...common, usedPercent: null }).status, "insufficient");
  assert.equal(buildQuotaForecast({ ...common, usedPercent: null, capacityCredits: 100, samples: [{ timestamp: common.observedAt, value: 1 }] }).status, "insufficient");
  assert.equal(buildQuotaForecast({ ...common, usedPercent: 20, samples: [] }).status, "insufficient");
  assert.equal(buildQuotaForecast({ ...common, usedPercent: 20, observedAt: "broken" }).status, "unavailable");
});


test("old unrated calls trim forecast history without hiding a fully priced current week", () => {
  const options = { rangeStart: "2026-08-31T10:15:00Z", rangeEnd: "2026-09-07T10:15:00Z", observedAt: "2026-09-04T22:15:00Z", usedPercent: 40 };
  const recent = Array.from({ length: 108 }, (_, index) => ({ timestamp: new Date(Date.parse(options.observedAt) - index * FORECAST_HOUR_MS).toISOString(), value: 10, rated: true }));
  const old = [{ timestamp: "2026-08-10T10:00:00Z", value: 0, rated: false }, { timestamp: "2026-08-09T10:00:00Z", value: 10000000, rated: true }];
  const clean = buildQuotaForecast({ ...options, samples: recent });
  const result = buildQuotaForecast({ ...options, samples: [...old, ...recent] });
  assert.equal(result.status, "ready");
  assert.equal(result.creditsPerHour, clean.creditsPerHour);
  assert.equal(result.expectedFinalPercent, clean.expectedFinalPercent);
  assert.equal(result.actual.at(-1).percent, 40);
  assert.ok(result.projected.length > 0);
  const incompleteWeek = buildQuotaForecast({ ...options, samples: [...recent, { timestamp: "2026-09-02T10:00:00Z", value: 0, rated: false }] });
  assert.equal(incompleteWeek.reason, "unrated-usage");
});


test("a week with unrated calls can project from independent complete-period capacity", () => {
  const options = { rangeStart: "2026-08-31T08:15:00Z", rangeEnd: "2026-09-07T08:15:00Z", observedAt: "2026-09-04T23:00:00Z", usedPercent: 61, capacityCredits: 35000 };
  const samples = Array.from({ length: 90 }, (_, index) => ({ timestamp: new Date(Date.parse(options.observedAt) - index * FORECAST_HOUR_MS).toISOString(), value: 30, rated: true }));
  samples.push({ timestamp: "2026-08-31T18:57:00Z", value: 0, rated: false });
  const result = buildQuotaForecast({ ...options, samples });
  assert.equal(result.status, "ready");
  assert.equal(result.partialHistory, true);
  assert.equal(result.calibrationSource, "history");
  assert.ok(result.actual.length > 90);
  assert.equal(result.actual[0].percent, 0);
  assert.deepEqual(result.actual.at(-1), { timestamp: "2026-09-04T23:00:00.000Z", percent: 61 });
  assert.ok(result.actual.some(point => point.percent > 0 && point.percent < 61));
  assert.ok(result.projected.length > 1);
  assert.ok(result.expectedFinalPercent > 61);
  assert.ok(Math.abs(result.creditsPerHour - 30) < 1e-9);
  assert.equal(buildQuotaForecast({ ...options, capacityCredits: null, samples }).reason, "unrated-usage");
});


test("hover never extrapolates observed quota into an incomplete historical range", () => {
  const points = [{ timestamp: "2026-09-04T23:00:00Z", percent: 61 }];
  assert.equal(interpolateForecastPercent(points, "2026-09-03T23:00:00Z", { clamp: false }), null);
  assert.equal(interpolateForecastPercent(points, points[0].timestamp, { clamp: false }), 61);
  assert.equal(interpolateForecastPercent(points, "2026-09-05T23:00:00Z", { clamp: false }), null);
  assert.equal(interpolateForecastPercent(points, "2026-09-03T23:00:00Z"), 61);
});


test("completed periods retain their estimated past curve despite a late unrated call", () => {
  const result = buildQuotaForecast({ rangeStart: "2026-09-01T00:00:00Z", rangeEnd: "2026-09-02T00:00:00Z", observedAt: "2026-09-02T00:00:00Z", usedPercent: 20, project: false, samples: [
    { timestamp: "2026-09-01T02:00:00Z", value: 10, rated: true },
    { timestamp: "2026-09-01T12:00:00Z", value: 20, rated: true },
    { timestamp: "2026-09-01T23:59:00Z", value: 0, rated: false },
  ] });
  assert.equal(result.status, "ready");
  assert.equal(result.partialHistory, true);
  assert.equal(result.completed, true);
  assert.ok(result.actual.length > 2);
  assert.equal(result.actual.at(-1).percent, 20);
  assert.deepEqual(result.projected, []);
});
