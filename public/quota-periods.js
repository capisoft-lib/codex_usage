export const QUOTA_RESET_TOLERANCE_MS = 5 * 60_000;

export function sameQuotaReset(left, right) {
  if (left === right) return true;
  const a = Date.parse(left), b = Date.parse(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= QUOTA_RESET_TOLERANCE_MS;
}

// A subscription window is shared across machines. Slightly different reset
// timestamps are corrections to that window, not additional purchases/resets.
export function normalizeQuotaPeriods(data) {
  const values = [...(data?.weeklyQuotaHistory || []), data?.weeklyQuota].filter((quota) => quota && Number.isFinite(Date.parse(quota.resetsAt)) && !quota.theoretical);
  values.sort((a, b) => Date.parse(a.resetsAt) - Date.parse(b.resetsAt));
  const clusters = [];
  for (const value of values) {
    const minutes = Number(value.windowMinutes) || 10080;
    const previous = clusters.at(-1);
    if (previous && previous.minutes === minutes && Date.parse(value.resetsAt) - previous.firstReset <= QUOTA_RESET_TOLERANCE_MS) previous.items.push(value);
    else clusters.push({ minutes, firstReset: Date.parse(value.resetsAt), items: [value] });
  }
  const periods = clusters.map(({ minutes, items }) => {
    items.sort((a, b) => (Date.parse(a.observedAt) || 0) - (Date.parse(b.observedAt) || 0));
    const latest = items.at(-1);
    const reset = Date.parse(latest.resetsAt);
    const starts = items.map((value) => Date.parse(value.startsAt)).filter(Number.isFinite);
    const start = starts.length ? Math.min(...starts) : reset - minutes * 60_000;
    const byTime = new Map();
    for (const item of items) {
      for (const point of item.observations || []) {
        const time = Date.parse(point.observedAt);
        if (Number.isFinite(time) && Number.isFinite(point.usedPercent)) byTime.set(time, { observedAt: new Date(time).toISOString(), usedPercent: point.usedPercent });
      }
    }
    const nodes = new Set(items.map((item) => item.nodeId).filter(Boolean));
    const peak = items.reduce((best, item) => Number(item.peakUsedPercent ?? item.usedPercent) > Number(best.peakUsedPercent ?? best.usedPercent) ? item : best, latest);
    return { ...latest, startsAt: new Date(start).toISOString(), endsAt: latest.resetsAt, windowMinutes: minutes,
      peakUsedPercent: peak.peakUsedPercent ?? peak.usedPercent ?? null,
      peakObservedAt: peak.peakObservedAt || peak.observedAt || null,
      planTypes: [...new Set(items.flatMap((item) => item.planTypes?.length ? item.planTypes : [item.planType]).filter(Boolean))],
      ...(nodes.size > 1 ? { nodeId: null, nodeAlias: null } : {}),
      observations: [...byTime.values()].sort((a, b) => Date.parse(a.observedAt) - Date.parse(b.observedAt)),
    };
  }).sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt));
  return periods.map((period, index) => {
    const nextStart = index > 0 ? Date.parse(periods[index - 1].startsAt) : Infinity;
    const end = Math.min(Date.parse(period.resetsAt), nextStart);
    // Recompute ends after clustering. A stale node's clipped endsAt must not
    // close the live window and manufacture an unobserved next week.
    return { ...period, endsAt: new Date(end).toISOString(), observations: period.observations.filter((point) => Date.parse(point.observedAt) >= Date.parse(period.startsAt) && Date.parse(point.observedAt) <= end) };
  });
}

export function matchesQuotaEtag(header, etag) {
  // HTTP GET uses weak comparison; compression proxies may add the W/ prefix.
  const normalize = (value) => String(value || "").trim().replace(/^W\//, "");
  return String(header || "").split(",").some((value) => value.trim() === "*" || normalize(value) === normalize(etag));
}
