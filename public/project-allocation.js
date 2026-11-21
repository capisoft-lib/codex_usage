import { weeklyQuotaPeriods } from "./quota-display.js";
import { quotaPlanSegment } from "./quota-plans.js";

export const SUBSCRIPTION_AMOUNTS_KEY = "codex-usage-subscription-amounts-v1";
// User-supplied amount, not an official subscription price catalog.
export const DEFAULT_SUBSCRIPTION_AMOUNTS = Object.freeze({ pro: 223, prolite: 100 });

export function weeklySubscriptionAmount(monthlyAmount) {
  return Number.isFinite(monthlyAmount) && monthlyAmount >= 0 ? monthlyAmount * 12 / 52 : null;
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

export function weeklyAllocationWindow(data, now = new Date()) {
  const quota = weeklyQuotaPeriods(data, now)[0];
  const reset = Date.parse(quota?.resetsAt);
  const from = Date.parse(quota?.startsAt);
  const to = Date.parse(quota?.observedAt);
  if (!quota || quota.theoretical || !Number.isFinite(from) || !Number.isFinite(to)
    || !Number.isFinite(reset) || to < from || to > +now || to >= reset || reset <= +now
    || quotaPlanSegment(quota).changed || !Number.isFinite(quota.usedPercent)
    || quota.usedPercent < 0 || quota.usedPercent > 100) return null;
  return { from, to, resetsAt: quota.resetsAt, usedPercent: quota.usedPercent,
    observedAt: quota.observedAt, plan: subscriptionPlan(quota) };
}

export function projectWeeklyAllocation(allocation, key, amounts, now = Date.now()) {
  if (!allocation || Date.parse(allocation.resetsAt) <= +now || allocation.unratedCalls > 0
    || !Number.isFinite(allocation.usedPercent) || !Number.isFinite(allocation.totalWeight)) return null;
  if (allocation.totalWeight <= 0 && allocation.usedPercent > 0) return null;
  const projectWeight = allocation.projects?.[key] || 0;
  const weeklyPercent = allocation.totalWeight > 0 ? projectWeight / allocation.totalWeight * allocation.usedPercent : 0;
  const amount = weeklySubscriptionAmount(amounts?.[allocation.plan]);
  return { weeklyPercent, subscriptionCost: amount === null ? null : weeklyPercent / 100 * amount };
}
