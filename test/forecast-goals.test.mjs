import assert from "node:assert/strict";
import test from "node:test";
import { forecastGoalValue, normalizeForecastGoals, parseGoalUtc, FORECAST_GOALS_I18N } from "../public/forecast-goals.js";

const forecast = {
  status: "ready", historySource: "observed", rangeStart: "2026-10-25T20:00:00Z", rangeEnd: "2026-11-01T20:00:00Z",
  actual: [{ timestamp: "2026-10-26T20:00:00Z", percent: 10 }, { timestamp: "2026-10-27T20:00:00Z", percent: 40 }],
  projected: [{ timestamp: "2026-10-27T20:00:00Z", percent: 40 }, { timestamp: "2026-11-01T20:00:00Z", percent: 140 }],
};

test("goal input is explicitly UTC, including across daylight saving dates", () => {
  assert.equal(parseGoalUtc("2026-10-29T20:00"), "2026-10-29T20:00:00.000Z");
  assert.equal(parseGoalUtc("2026-10-25T02:30"), "2026-10-25T02:30:00.000Z");
  for (const input of ["", null, "2026-02-30T20:00", "2026-10-29T24:00", "2026-13-29T20:00", "2026-10-29", "2026-10-29T20:00Z"]) assert.equal(parseGoalUtc(input), null);
});

test("the October 29 deadline uses the forecast curve, without capping at 100%", () => {
  assert.deepEqual(forecastGoalValue(forecast, parseGoalUtc("2026-10-29T20:00")), { kind: "projected", percent: 80, inRange: true });
  assert.equal(forecastGoalValue(forecast, "2026-10-31T20:00:00Z").percent, 120);
  assert.equal(forecastGoalValue(forecast, forecast.rangeEnd).percent, 140);
});

test("past goals distinguish observed and estimated history", () => {
  assert.deepEqual(forecastGoalValue(forecast, "2026-10-27T08:00:00Z"), { kind: "observed", percent: 25, inRange: true });
  assert.equal(forecastGoalValue({ ...forecast, historySource: "estimated" }, "2026-10-27T08:00:00Z").kind, "estimated");
  assert.equal(forecastGoalValue(forecast, forecast.projected[0].timestamp).kind, "observed");
});

test("goals never extrapolate across a reset or fill missing forecast/history", () => {
  for (const at of ["2026-10-25T19:59:00Z", "2026-11-01T20:01:00Z"]) assert.deepEqual(forecastGoalValue(forecast, at), { kind: "outside", percent: null, inRange: false });
  assert.deepEqual(forecastGoalValue(forecast, forecast.rangeStart), { kind: "unavailable", percent: null, inRange: true });
  assert.deepEqual(forecastGoalValue({ ...forecast, projected: [] }, "2026-10-29T20:00:00Z"), { kind: "unavailable", percent: null, inRange: true });
  assert.equal(forecastGoalValue(null, "2026-10-29T20:00:00Z").percent, null);
  assert.equal(forecastGoalValue({ ...forecast, status: "insufficient" }, "2026-10-29T20:00:00Z").percent, null);
});

test("stored goals survive reload as ordered UTC dates, ignoring corrupt entries", () => {
  const goals = [{ id: "second", name: " Delivery ", at: "2026-10-30T20:00:00Z" }, { id: "first", name: "Reset", at: "2026-10-29T20:00:00Z" }];
  const normalized = normalizeForecastGoals(JSON.parse(JSON.stringify([...goals, goals[0], null, {}, { id: "bad", name: "No timezone", at: "2026-10-29T20:00" }])));
  assert.equal(normalized.length, 2);
  assert.deepEqual(normalized.map(goal => goal.id), ["first", "second"]);
  assert.equal(normalized[1].name, "Delivery");
  assert.equal(normalized[0].at, "2026-10-29T20:00:00.000Z");
  assert.equal(goals[0].name, " Delivery ");
  assert.deepEqual(normalizeForecastGoals({}), []);
});

test("all nine languages translate goal labels and preserve placeholders", () => {
  const keys = Object.keys(FORECAST_GOALS_I18N.en).sort();
  assert.equal(Object.keys(FORECAST_GOALS_I18N).length, 9);
  for (const messages of Object.values(FORECAST_GOALS_I18N)) {
    assert.deepEqual(Object.keys(messages).sort(), keys);
    for (const key of keys) assert.deepEqual(messages[key].match(/\{\w+\}/g), FORECAST_GOALS_I18N.en[key].match(/\{\w+\}/g));
  }
});
