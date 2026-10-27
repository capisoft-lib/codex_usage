import { weeklyQuotaPeriods } from "./quota-display.js";

export const SUBSCRIPTION_AMOUNTS_KEY = "codex-usage-subscription-amounts-v1";
// User-supplied amount, not an official subscription price catalog.
export const DEFAULT_SUBSCRIPTION_AMOUNTS = Object.freeze({ pro: 223 });

export function weeklySubscriptionAmount(monthlyAmount) {
  return Number.isFinite(monthlyAmount) && monthlyAmount >= 0 ? monthlyAmount * 12 / 52 : null;
}

export function subscriptionPlan(quota) {
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
  const from = Date.parse(quota?.startsAt) || reset - (quota?.windowMinutes || 10080) * 60000;
  if (!quota || quota.theoretical || !Number.isFinite(from) || from > +now || reset <= +now
    || !Number.isFinite(reset) || !Number.isFinite(quota.usedPercent)
    || quota.usedPercent < 0 || quota.usedPercent > 100) return null;
  return { from, to: +now, resetsAt: quota.resetsAt, usedPercent: quota.usedPercent,
    observedAt: quota.observedAt || null, plan: subscriptionPlan(quota) };
}

export function projectWeeklyAllocation(allocation, key, amounts, now = Date.now()) {
  if (!allocation || Date.parse(allocation.resetsAt) <= +now || allocation.unratedCalls > 0
    || !Number.isFinite(allocation.usedPercent) || !Number.isFinite(allocation.totalCost)) return null;
  if (allocation.totalCost <= 0 && allocation.usedPercent > 0) return null;
  const projectCost = allocation.projects?.[key] || 0;
  const weeklyPercent = allocation.totalCost > 0 ? projectCost / allocation.totalCost * allocation.usedPercent : 0;
  const amount = weeklySubscriptionAmount(amounts?.[allocation.plan]);
  return { weeklyPercent, subscriptionCost: amount === null ? null : weeklyPercent / 100 * amount };
}
