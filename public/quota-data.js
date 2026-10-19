import { weeklyQuotaPeriods } from "./quota-display.js";
import { resolveWeeklyRange } from "./date-range.js";
import { sameQuotaReset } from "./quota-periods.js";
import { codexCreditsOfCalls } from "./usage-pricing.js";
import { buildQuotaForecast, DEFAULT_LOOKBACK_HOURS, FORECAST_HOUR_MS, exponentialWeightedAverage, DEFAULT_CAPACITY_HALF_LIFE_PERIODS } from "./quota-forecast.js";

// Shared by both servers. The quota response never contains conversation details.
export function quotaMetadata(data) {
  const { sessions, ...metadata } = data;
  return { ...metadata, sessions: [], sessionCount: data.sessionCount ?? sessions?.length ?? 0, quotaOnly: true };
}

/** @param {object} data @param {string|null} reset @param {Date} now */
export function createQuotaDetail(data, reset = null, now = new Date()) {
  const periods = weeklyQuotaPeriods(data, now);
  const quota = periods.find((period) => sameQuotaReset(period.resetsAt, reset)) || periods[0] || null;
  const current = quota === periods[0];
  const fallback = resolveWeeklyRange(quota, now);
  const start = Date.parse(quota?.startsAt) || +fallback.start;
  const end = Date.parse(quota?.endsAt || quota?.resetsAt) || +fallback.end;
  const forecastStart = Math.min(start, Math.min(end, Date.parse(quota?.observedAt) || +now) - DEFAULT_LOOKBACK_HOURS * FORECAST_HOUR_MS);
  const plan = String(quota?.planType || "").trim().toLowerCase();
  const calibration = periods.filter((period) => {
    const otherPlan = String(period.planType || "").trim().toLowerCase();
    return !(plan && otherPlan && plan !== otherPlan) && !(quota?.nodeId && period.nodeId && quota.nodeId !== period.nodeId);
  }).map((period) => ({ start: Date.parse(period.startsAt), end: Date.parse(period.peakObservedAt || period.observedAt), percent: Number(period.peakUsedPercent ?? period.usedPercent), credits: 0, unrated: false }))
    .filter((period) => Number.isFinite(period.start) && Number.isFinite(period.end) && period.end > period.start && Number.isFinite(period.percent) && period.percent > 0);
  const calls = [];
  const samples = [];
  function calibrate(call, nodeId, priced) {
    if (quota?.nodeId && quota.nodeId !== nodeId) return;
    const time = Date.parse(call.timestamp);
    const rated = !call._invalidUsage && priced.unratedCalls === 0;
    for (const period of calibration) {
      if (!Number.isFinite(time)) { if (!rated) period.unrated = true; }
      else if (time >= period.start && time <= period.end) {
        period.credits += priced.credits;
        if (!rated) period.unrated = true;
      }
    }
  }
  /** @param {object} call @param {string|null} nodeId */
  function add(call, nodeId = null, includeCalibration = true) {
    const time = Date.parse(call.timestamp);
    if (time >= start && time < end) calls.push(call);
    if (quota?.nodeId && quota.nodeId !== nodeId) return;
    const priced = codexCreditsOfCalls([call], { billing: "subscription" });
    const rated = priced.unratedCalls === 0;
    if (!Number.isFinite(time) || (time >= forecastStart && time <= end)) samples.push({ timestamp: call.timestamp, value: priced.credits, rated });
    if (includeCalibration) calibrate(call,nodeId,priced);
  }
  return {
    // Bounds are for calls, never session start dates: a conversation may span weeks.
    from: Math.min(forecastStart, ...calibration.map((period) => period.start)),
    to: Math.max(end, ...calibration.map((period) => period.end)),
    sampleFrom: current ? forecastStart : start,
    sampleTo: end,
    callsFrom: start,
    sampleAnchor: current ? Math.min(end,Math.max(Math.min(end,Date.parse(quota?.observedAt) || +now),+now)) : end,
    calibrationWindows: current ? calibration.map(period=>({start:period.start,end:period.end})) : [],
    calibrationNodeId: quota?.nodeId || null,
    reset: quota?.resetsAt || null,
    /** @param {object} call @param {string|null} nodeId */
    add,
    /** @param {object} call @param {string|null} nodeId */
    addRecent(call,nodeId=null) { add(call,nodeId,false); },
    /** @param {object} call @param {string|null} nodeId */
    addHistoricalSample(call,nodeId=null) {
      if (quota?.nodeId && quota.nodeId !== nodeId) return;
      const priced = call._invalidUsage ? {credits:0,unratedCalls:1} : codexCreditsOfCalls([call],{billing:'subscription'});
      samples.push({timestamp:call.timestamp,value:priced.credits,rated:priced.unratedCalls===0});
    },
    /** @param {object} call @param {string|null} nodeId */
    addCalibration(call,nodeId=null) { calibrate(call,nodeId,codexCreditsOfCalls([call],{billing:'subscription'})); },
    finish() {
      const capacities = calibration.filter((period) => !period.unrated && period.credits > 0).sort((a, b) => a.end - b.end).map((period) => period.credits * 100 / period.percent);
      const capacityCredits = capacities.length ? exponentialWeightedAverage(capacities, DEFAULT_CAPACITY_HALF_LIFE_PERIODS) : null;
      const forecast = buildQuotaForecast({
        samples, observations: quota?.observations, rangeStart: start, rangeEnd: end,
        observedAt: current || quota?.observations?.length ? (quota?.observedAt || now) : end,
        asOf: current ? now : end, usedPercent: current ? quota?.usedPercent : quota?.peakUsedPercent,
        project: current, capacityCredits: current ? capacityCredits : null,
      });
      return { ...quotaMetadata(data), quotaDetail: { reset: quota?.resetsAt || null, forecast }, sessions: [{ id: "quota-window", calls, turns: [] }] };
    },
  };
}
