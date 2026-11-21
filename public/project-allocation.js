import { weeklyQuotaPeriods } from "./quota-display.js";
import { quotaPlanSegment } from "./quota-plans.js";

export const SUBSCRIPTION_AMOUNTS_KEY = "codex-usage-subscription-amounts-v1";
// User-supplied amount, not an official subscription price catalog.
export const DEFAULT_SUBSCRIPTION_AMOUNTS = Object.freeze({ pro: 223, prolite: 100 });

export function weeklySubscriptionAmount(monthlyAmount) {
  return Number.isFinite(monthlyAmount) && monthlyAmount >= 0 ? monthlyAmount * 12 / 52 : null;
}

export function projectSubscriptionCost(reading, monthlyAmount) {
  const base = weeklySubscriptionAmount(monthlyAmount);
  const percent = reading.belowResolution ? 1 : reading.attributedPercent;
  return base !== null && Number.isFinite(percent) ? base * percent / 100 : null;
}

export function subscriptionPlan(quota) {
  if (quota?.planType) return String(quota.planType).trim().toLowerCase();
  const plans = [...new Set((quota?.planTypes?.length ? quota.planTypes : [quota?.planType])
    .filter(Boolean).map(plan => String(plan).trim().toLowerCase()))];
  return plans.length === 1 ? plans[0] : "unknown";
}

export function normalizeSubscriptionAmounts(value) {
  const amounts = { ...DEFAULT_SUBSCRIPTION_AMOUNTS };
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [plan, amount] of Object.entries(value)) {
      if (/^[a-z0-9_-]+$/.test(plan) && (amount === null || (Number.isFinite(amount) && amount >= 0))) amounts[plan] = amount;
    }
  }
  return amounts;
}

export function projectQuotaWindow(data, start, end, now = new Date()) {
  const quota = weeklyQuotaPeriods(data, now)[0];
  const reset = Date.parse(quota?.resetsAt);
  const weekStart = Date.parse(quota?.startsAt);
  const from = Math.max(weekStart, start);
  const to = Math.min(reset - 1, end);
  if (!quota || quota.theoretical || !Number.isFinite(from) || from > to
    || !Number.isFinite(reset) || reset <= +now || quotaPlanSegment(quota).changed) return null;

  const points = new Map();
  for (const { observedAt, usedPercent } of [...(quota.observations || []), quota]) {
    const time = Date.parse(observedAt);
    if (time >= weekStart && time <= +now && Number.isFinite(usedPercent) && usedPercent >= 0 && usedPercent <= 100)
      points.set(time, usedPercent);
  }
  if (points.size < 2) return null;
  const ordered = [...points].sort(([a], [b]) => a - b);
  return { from, to, resetsAt: quota.resetsAt, plan:subscriptionPlan(quota), points:ordered,
    scanFrom:ordered.findLast(([time]) => time < from)?.[0] ?? from,
    scanTo:ordered.find(([time]) => time > to)?.[0] ?? to };
}

// Calls at an observation timestamp are recorded with that observation.
export function quotaObservationInterval(points, time) {
  let low = 1, high = points.length;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (points[middle][0] < time) low = middle + 1;
    else high = middle;
  }
  return time > points[0][0] && low < points.length ? low : null;
}

export function projectQuotaReading(points, [firstCall, lastCall], activity, key) {
  const start = points.findLastIndex(([time]) => time < firstCall);
  const end = points.findIndex(([time]) => time > lastCall);
  if (start < 0 || end <= start) return null;
  const [beforeAt, beforePercent] = points[start];
  const [afterAt, afterPercent] = points[end];
  const enclosed = points.slice(start, end + 1);
  if (enclosed.some(([, percent], i) => i > 0 && percent < enclosed[i - 1][1])) return null;
  const delta = afterPercent - beforePercent;
  // At 100% the counter can stay saturated. A flat saturated reading gives no bound.
  if (delta === 0 && beforePercent === 100) return null;
  const attributable = delta > 0 && enclosed.every(([, percent], i) => {
    if (!i || percent === enclosed[i - 1][1]) return true;
    const interval = activity.get(start + i);
    return interval?.key === key && !interval.shared && !interval.outsideSelection;
  });
  return { beforeAt, afterAt, beforePercent, afterPercent, delta, attributedPercent:attributable ? delta : null,
    belowResolution: delta === 0 && enclosed.every(([, percent]) => Number.isInteger(percent)) };
}
