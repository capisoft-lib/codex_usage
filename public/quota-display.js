import { quotaCountdownParts, theoreticalWeeklyQuotaPeriod } from "./date-range.js";

export function normalizeTimeFormat(value) {
  return ["system", "12", "24"].includes(value) ? value : "system";
}

export function timeFormatOptions(value) {
  const format = normalizeTimeFormat(value);
  if (format === "12") return { hour12: true };
  if (format === "24") return { hour12: false };
  const hour12 = new Intl.DateTimeFormat(undefined, { hour: "numeric" }).resolvedOptions().hour12;
  return typeof hour12 === "boolean" ? { hour12 } : {};
}

export function weeklyQuotaPeriods(data, now = new Date()) {
  const history = data?.weeklyQuotaHistory;
  const observed = Array.isArray(history) && history.length ? history : data?.weeklyQuota ? [data.weeklyQuota] : [];
  const theoretical = theoreticalWeeklyQuotaPeriod(observed[0], now);
  return theoretical ? [theoretical, ...observed] : observed;
}

export function shortQuotaDisplay(quota, now = Date.now()) {
  const reset = Date.parse(quota?.resetsAt);
  const expired = Number.isFinite(reset) && reset <= Number(now);
  return {
    expired,
    remainingPercent: !expired && Number.isFinite(quota?.remainingPercent) ? quota.remainingPercent : null,
    resetsAt: !expired && Number.isFinite(reset) ? new Date(reset) : null,
  };
}

export function quotaCountdownText(resetAt, locale, now = new Date()) {
  const parts = quotaCountdownParts(resetAt, now);
  if (!parts) return "";
  const unit = (value, name, padded = false) => new Intl.NumberFormat(locale, {
    style: "unit", unit: name, unitDisplay: "narrow", useGrouping: false,
    minimumIntegerDigits: padded ? 2 : 1,
  }).format(value);
  const values = [];
  if (parts.days) values.push(unit(parts.days, "day"));
  if (parts.days || parts.hours) values.push(unit(parts.hours, "hour", Boolean(parts.days)));
  if (parts.days || parts.hours || parts.minutes) values.push(unit(parts.minutes, "minute", Boolean(parts.days || parts.hours)));
  values.push(unit(parts.seconds, "second", Boolean(parts.days || parts.hours || parts.minutes)));
  return values.join(" ");
}
