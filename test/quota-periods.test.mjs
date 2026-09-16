import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { normalizeQuotaPeriods, sameQuotaReset, matchesQuotaEtag } from "../public/quota-periods.js";
import { weeklyQuotaPeriods } from "../public/quota-display.js";
import { createQuotaDetail } from "../public/quota-data.js";

const now = new Date("2026-09-16T06:00:00Z");
const base = { startsAt: "2026-09-12T09:57:16Z", resetsAt: "2026-09-19T09:57:16Z", windowMinutes: 10080, observedAt: "2026-09-16T05:00:00Z", usedPercent: 90, planType: "pro", observations: [{ observedAt: "2026-09-13T06:00:00Z", usedPercent: 20 }] };

test("three reset variants merge before clipping, retaining the live period and measurements", () => {
  const variants = [base, { ...base, nodeId: "a", resetsAt: "2026-09-19T09:57:17Z", endsAt: "2026-09-12T09:59:23Z" }, { ...base, nodeId: "b", startsAt: "2026-09-12T09:59:23Z", resetsAt: "2026-09-19T09:59:23Z", observedAt: "2026-09-16T05:30:00Z", usedPercent: 92, observations: [{ observedAt: "2026-09-16T05:30:00Z", usedPercent: 92 }] }];
  const earlier = { ...base, startsAt: "2026-09-08T03:46:17Z", resetsAt: "2026-09-15T03:46:17Z", observedAt: "2026-09-16T05:40:00Z" };
  const data = { weeklyQuota: variants[1], weeklyQuotaHistory: [...variants, earlier] };
  const periods = weeklyQuotaPeriods(data, now);
  assert.equal(periods.length, 2);
  assert.equal(periods[0].theoretical, undefined);
  assert.equal(periods[0].usedPercent, 92);
  assert.equal(periods[0].nodeId, null);
  assert.equal(periods[0].observations.length, 2);
  assert.equal(Date.parse(periods[0].endsAt), Date.parse("2026-09-19T09:59:23Z"));
  assert.equal(periods[1].endsAt, periods[0].startsAt);
  assert.deepEqual(normalizeQuotaPeriods({ weeklyQuotaHistory: periods }), periods);
  assert.equal(createQuotaDetail(data, "2026-09-19T09:57:16Z", now).reset, periods[0].resetsAt);
});

test("real early resets and real expiration remain distinct from timestamp jitter", () => {
  assert.equal(sameQuotaReset(base.resetsAt, "2026-09-19T09:59:23Z"), true);
  assert.equal(sameQuotaReset(base.resetsAt, "2026-09-19T10:57:16Z"), false);
  const periods = weeklyQuotaPeriods({ weeklyQuotaHistory: [base] }, new Date("2026-09-20T00:00:00Z"));
  assert.equal(periods.length, 2);
  assert.equal(periods[0].theoretical, true);
  assert.equal(periods[0].usedPercent, null);
});

test("overlapping windows do not count a boundary call in both periods", () => {
  const earlier = { ...base, startsAt: "2026-09-08T03:46:17Z", resetsAt: "2026-09-15T03:46:17Z" };
  const data = { weeklyQuotaHistory: [base, earlier] };
  const call = { timestamp: base.startsAt, model: "gpt-5", usage: { inputTokens: 1000 } };
  const current = createQuotaDetail(data, base.resetsAt, now);
  const previous = createQuotaDetail(data, earlier.resetsAt, now);
  current.add(call); previous.add(call);
  assert.equal(current.finish().sessions[0].calls.length, 1);
  assert.equal(previous.finish().sessions[0].calls.length, 0);
});

test("clock and selected history survive one-second and two-minute reset corrections", () => {
  const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
  const code = source.slice(source.indexOf("function syncQuotaClock("), source.indexOf("\nsetInterval(", source.indexOf("function syncQuotaClock(")));
  const state = { data: {}, view: "quota", renderedQuotaReset: base.resetsAt, selectedQuotaReset: base.resetsAt };
  let renders = 0;
  const context = vm.createContext({ state, sameQuotaReset, quotaPeriods: () => [{ resetsAt: "2026-09-19T09:59:23Z" }], render: () => renders++, renderQuotaPage: () => renders++, renderFreshness() {}, renderQuotaNav() {} });
  vm.runInContext(code + "\nsyncQuotaClock()", context);
  assert.equal(renders, 0);
  assert.equal(state.selectedQuotaReset, base.resetsAt);
});

test("proxy-generated weak ETags prevent unnecessary detail rebuilds", () => {
  assert.equal(matchesQuotaEtag('W/"quota-v1"', '"quota-v1"'), true);
  assert.equal(matchesQuotaEtag('"old", W/"quota-v1"', '"quota-v1"'), true);
  assert.equal(matchesQuotaEtag('W/"old"', '"quota-v1"'), false);
});
