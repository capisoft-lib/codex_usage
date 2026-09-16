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
  return {
    // Bounds are for calls, never session start dates: a conversation may span weeks.
    from: Math.min(forecastStart, ...calibration.map((period) => period.start)),
    to: Math.max(end, ...calibration.map((period) => period.end)),
    reset: quota?.resetsAt || null,
    add(call, nodeId = null) {
      const time = Date.parse(call.timestamp);
      if (time >= start && time < end) calls.push(call);
      if (quota?.nodeId && quota.nodeId !== nodeId) return;
      const priced = codexCreditsOfCalls([call]);
      const rated = priced.unratedCalls === 0;
      if (!Number.isFinite(time) || (time >= forecastStart && time <= end)) samples.push({ timestamp: call.timestamp, value: priced.credits, rated });
      for (const period of calibration) {
        if (!Number.isFinite(time)) { if (!rated) period.unrated = true; }
        else if (time >= period.start && time <= period.end) {
          period.credits += priced.credits;
          if (!rated) period.unrated = true;
        }
      }
    },
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
