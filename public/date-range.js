export function toDateTimeLocalValue(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function defaultCustomRange(now = new Date()) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return { start: toDateTimeLocalValue(start), end: null };
}

export function normalizeCustomRange(value, now = new Date()) {
  const fallback = defaultCustomRange(now);
  const start = typeof value?.start === "string" && Number.isFinite(Date.parse(value.start)) ? value.start : fallback.start;
  const end = value?.end === null
    ? null
    : typeof value?.end === "string" && Number.isFinite(Date.parse(value.end)) ? value.end : fallback.end;
  return { start, end };
}

export function resolveDateRange(period, customRange, now = new Date()) {
  if (period === "custom") {
    const custom = normalizeCustomRange(customRange, now);
    return { start: new Date(custom.start), end: custom.end === null ? null : new Date(custom.end) };
  }
  const end = new Date(now);
  if (period === "all") return { start: new Date(0), end };
  if (period === "today") {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return { start, end };
  }
  const days = period === "7d" ? 7 : 30;
  const start = new Date(now);
  start.setDate(start.getDate() - days + 1);
  start.setHours(0, 0, 0, 0);
  return { start, end };
}

export function timestampInRange(timestamp, range) {
  const time = Date.parse(timestamp);
  const start = range?.start?.getTime();
  const end = range?.end?.getTime();
  return Number.isFinite(time)
    && Number.isFinite(start)
    && time >= start
    && (!Number.isFinite(end) || time <= end);
}

export function latestTimestamp(items = [], key = "timestamp") {
  let latest = null;
  for (const item of items) {
    const candidate = item?.[key];
    const time = Date.parse(candidate);
    if (Number.isFinite(time) && (latest === null || time > latest.time)) latest = { value: candidate, time };
  }
  return latest?.value || null;
}
