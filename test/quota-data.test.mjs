import assert from "node:assert/strict";
import test from "node:test";
import { createQuotaDetail, quotaMetadata } from "../public/quota-data.js";
import { buildQuotaForecast, estimateQuotaCapacityCredits } from "../public/quota-forecast.js";
import { codexCreditsOfCalls } from "../public/usage-pricing.js";

const now = new Date("2026-09-16T06:00:00Z");
const current = { startsAt: "2026-09-14T12:00:00Z", resetsAt: "2026-09-21T12:00:00Z", windowMinutes: 10080, observedAt: now.toISOString(), peakObservedAt: now.toISOString(), usedPercent: 30, peakUsedPercent: 30, planType: "pro", nodeId: "a" };
const previous = { ...current, startsAt: "2026-09-07T12:00:00Z", resetsAt: current.startsAt, observedAt: current.startsAt, peakObservedAt: current.startsAt, usedPercent: 60, peakUsedPercent: 60 };
const call = (timestamp, model = "gpt-5", serviceTier = "default") => ({ timestamp, model, serviceTier, effort: "high", usage: { inputTokens: 10000, cachedInputTokens: 6000, outputTokens: 1000, totalTokens: 11000 } });

function near(actual, expected) {
  if (typeof expected === "number") assert.ok(Math.abs(actual - expected) <= 1e-8 * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);
  else if (expected && typeof expected === "object") {
    assert.deepEqual(Object.keys(actual), Object.keys(expected));
    for (const key of Object.keys(expected)) near(actual[key], expected[key]);
  } else assert.equal(actual, expected);
}

for (const variation of ["normal", "unrated", "invalid", "measured", "other-plan", "historical"]) {
  test(`light quota response preserves totals and complete forecast: ${variation}`, () => {
    const quota = structuredClone(current);
    if (variation === "measured") quota.observations = [{ observedAt: "2026-09-15T06:00:00Z", usedPercent: 15 }, { observedAt: now.toISOString(), usedPercent: 30 }];
    const periods = [quota, { ...previous, planType: variation === "other-plan" ? "plus" : "pro" }];
    const calls = [call("2026-06-01T00:00:00Z"), call("2026-09-08T14:00:00Z"), call(current.startsAt), call("2026-09-15T18:00:00Z", "gpt-5", "priority"), call(now.toISOString()), call(current.resetsAt)];
    if (variation === "unrated") calls.push(call("2026-09-15T19:00:00Z", "unpriced-model"));
    if (variation === "invalid") calls.push(call("invalid", "unpriced-model"));
    const data = { weeklyQuota: quota, weeklyQuotaHistory: periods, sessions: [{ nodeId: "a", title: "private", startedAt: "2026-06-01", calls }, { nodeId: "b", calls: [call("2026-09-15T19:00:00Z")] }] };
    const selected = variation === "historical" ? periods[1] : quota;
    const builder = createQuotaDetail(data, selected.resetsAt, now);
    for (const session of data.sessions) for (const value of session.calls) builder.add(value, session.nodeId);
    const result = builder.finish();
    const expectedCalls = data.sessions.flatMap((session) => session.calls).filter((value) => Date.parse(value.timestamp) >= Date.parse(selected.startsAt) && Date.parse(value.timestamp) < Date.parse(selected.resetsAt));
    assert.deepEqual(result.sessions[0].calls, expectedCalls);
    assert.equal(JSON.stringify(result).includes("private"), false);
    assert.deepEqual(quotaMetadata(data).sessions, []);
    const samples = calls.map((value) => { const priced = codexCreditsOfCalls([value]); return { timestamp: value.timestamp, value: priced.credits, rated: !priced.unratedCalls }; });
    const isCurrent = selected === quota;
    const expected = buildQuotaForecast({ samples, observations: selected.observations, rangeStart: selected.startsAt, rangeEnd: selected.resetsAt, observedAt: isCurrent ? selected.observedAt : selected.resetsAt, asOf: isCurrent ? now : selected.resetsAt, usedPercent: selected.peakUsedPercent, project: isCurrent, capacityCredits: isCurrent ? estimateQuotaCapacityCredits({ samples, quotaPeriods: periods, planType: selected.planType, nodeId: selected.nodeId }) : null });
    near(result.quotaDetail.forecast, expected);
  });
}

test("empty accounts and expired windows remain valid lightweight responses", () => {
  for (const data of [{ sessions: [] }, { sessions: [], weeklyQuota: previous }]) {
    const builder = createQuotaDetail(data, null, now);
    assert.ok(Number.isFinite(builder.from) && Number.isFinite(builder.to));
    assert.equal(builder.finish().quotaOnly, true);
  }
});
