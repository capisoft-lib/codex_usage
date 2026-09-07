import { resolveDateRange } from "./date-range.js";

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

export function boundedRatio(value, total) {
  const safeValue = finiteNonNegative(value);
  const safeTotal = finiteNonNegative(total);
  if (!safeTotal) return 0;
  return Math.min(1, safeValue / safeTotal);
}

export function percentageOf(value, total) {
  return boundedRatio(value, total) * 100;
}

export function stackedChartSegments(values, maximum, chartHeight = 205) {
  const height = finiteNonNegative(chartHeight);
  let cursor = height;
  return values.map(({ key, value }) => {
    const segmentHeight = boundedRatio(value, maximum) * height;
    cursor = Math.max(0, cursor - segmentHeight);
    return { key, y: cursor, height: segmentHeight };
  });
}

export function nextChartGranularity(granularity) {
  if (granularity === "month") return "day";
  if (granularity === "day") return "hour";
  return null;
}

export function chartDrilldownFilterRange(range) {
  const start = new Date(range?.start);
  const exclusiveEnd = new Date(range?.end);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(exclusiveEnd.getTime()) || start >= exclusiveEnd) return null;
  return { start, end: new Date(exclusiveEnd.getTime() - 1) };
}

export function monthlyChartBuckets(calls, period, locale = "en-US", now = new Date()) {
  if (!["12m", "all"].includes(period)) return [];
  const range = resolveDateRange(period, null, now);
  const rangeStart = range.start.getTime();
  const rangeEnd = range.end.getTime();
  if (!Number.isFinite(rangeStart) || !Number.isFinite(rangeEnd)) return [];

  const included = [];
  let firstTime = rangeEnd;
  for (const call of calls) {
    const time = Date.parse(call.timestamp);
    if (!Number.isFinite(time) || time < rangeStart || time > rangeEnd) continue;
    included.push({ call, time });
    firstTime = Math.min(firstTime, time);
  }

  const cursor = new Date(period === "all" ? firstTime : rangeStart);
  cursor.setDate(1);
  cursor.setHours(0, 0, 0, 0);
  const firstMonth = cursor.getFullYear() * 12 + cursor.getMonth();
  const buckets = [];
  while (cursor.getTime() <= rangeEnd) {
    const next = new Date(cursor);
    next.setMonth(next.getMonth() + 1);
    buckets.push({
      start: new Date(Math.max(cursor.getTime(), rangeStart)),
      // Filters include the final millisecond; chart drill-down uses an exclusive end.
      end: new Date(Math.min(next.getTime(), rangeEnd + 1)),
      label: cursor.toLocaleDateString(locale, { month: "short", year: "2-digit" }),
      granularity: "month",
      calls: [],
    });
    cursor.setTime(next.getTime());
  }
  for (const { call, time } of included) {
    const date = new Date(time);
    const index = date.getFullYear() * 12 + date.getMonth() - firstMonth;
    buckets[index].calls.push(call);
  }
  return buckets;
}

export function chartDrilldownBuckets(calls, range, granularity, locale = "en-US", timeOptions = {}) {
  if (!range?.start || !range?.end || !["day", "hour"].includes(granularity)) return [];
  const limit = new Date(range.end);
  let cursor = new Date(range.start);
  if (!Number.isFinite(cursor.getTime()) || !Number.isFinite(limit.getTime()) || cursor >= limit) return [];

  const buckets = [];
  while (cursor < limit) {
    const start = new Date(cursor);
    const next = new Date(cursor);
    if (granularity === "day") next.setDate(next.getDate() + 1);
    else next.setHours(next.getHours() + 1);
    const end = next < limit ? next : new Date(limit);
    const label = granularity === "day"
      ? start.toLocaleDateString(locale, { day: "2-digit", month: "short" })
      : start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", ...timeOptions });
    buckets.push({ start, end, label, granularity, calls: [] });
    cursor = end;
  }

  for (const call of calls) {
    const time = Date.parse(call.timestamp);
    const bucket = buckets.find((item) => time >= item.start && time < item.end);
    if (bucket) bucket.calls.push(call);
  }
  return buckets;
}
