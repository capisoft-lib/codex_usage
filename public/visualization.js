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

export function chartDrilldownBuckets(calls, range, granularity, locale = "en-US") {
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
      : start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
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
