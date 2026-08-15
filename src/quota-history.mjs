export const QUOTA_RESET_CLUSTER_MS = 5 * 60 * 1_000;

function time(value) {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function boundedPercent(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(100, Math.max(0, parsed)) : null;
}

function plan(value) {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized ? normalized.slice(0, 80) : null;
}

function latestByObservedAt(items) {
  return [...items].sort((left, right) => (time(right.observedAt) || 0) - (time(left.observedAt) || 0))[0];
}

export function mergeWeeklyQuotaObservations(values = []) {
  const observations = values.flat(Infinity).filter((quota) => {
    const reset = time(quota?.resetsAt);
    const observed = time(quota?.observedAt);
    const windowMinutes = Number(quota?.windowMinutes);
    return reset !== null && observed !== null && Number.isFinite(windowMinutes) && windowMinutes > 0;
  }).sort((left, right) => time(left.resetsAt) - time(right.resetsAt));
  if (!observations.length) return [];

  const latestObservation = latestByObservedAt(observations);
  const clusters = [];
  for (const observation of observations) {
    const reset = time(observation.resetsAt);
    const previous = clusters.at(-1);
    const closeToPrevious = previous
      && Number(previous.windowMinutes) === Number(observation.windowMinutes)
      && reset - previous.lastReset <= QUOTA_RESET_CLUSTER_MS;
    if (closeToPrevious) {
      previous.items.push(observation);
      previous.lastReset = reset;
    } else {
      clusters.push({ windowMinutes: Number(observation.windowMinutes), lastReset: reset, items: [observation] });
    }
  }

  const periods = clusters.map((cluster) => {
    const chronological = [...cluster.items].sort((left, right) => time(left.observedAt) - time(right.observedAt));
    const latest = chronological.at(-1);
    const peak = chronological.reduce((best, item) => {
      const candidate = boundedPercent(item.usedPercent);
      const current = boundedPercent(best?.usedPercent);
      if (best === null || candidate > current || (candidate === current && time(item.observedAt) > time(best.observedAt))) return item;
      return best;
    }, null);
    const planTypes = [];
    for (const item of chronological) {
      const value = plan(item.planType);
      if (value && planTypes.at(-1) !== value) planTypes.push(value);
    }
    const usedPercent = boundedPercent(latest.usedPercent);
    const peakUsedPercent = boundedPercent(peak?.usedPercent);
    const resetTime = time(latest.resetsAt);
    return {
      startsAt: new Date(resetTime - cluster.windowMinutes * 60_000).toISOString(),
      resetsAt: new Date(resetTime).toISOString(),
      windowMinutes: cluster.windowMinutes,
      usedPercent,
      remainingPercent: usedPercent === null ? null : 100 - usedPercent,
      peakUsedPercent,
      peakObservedAt: peak?.observedAt || latest.observedAt,
      resetsAvailable: Number.isFinite(Number(latest.resetsAvailable)) ? Math.max(0, Number(latest.resetsAvailable)) : null,
      observedAt: latest.observedAt,
      firstObservedAt: chronological[0].observedAt,
      planType: plan(latest.planType) || planTypes.at(-1) || null,
      planTypes,
    };
  }).filter((period) => period.peakUsedPercent > 0 || clusterContainsLatest(period, latestObservation))
    .sort((left, right) => time(right.observedAt) - time(left.observedAt));

  return periods.map((period) => {
    const startTime = time(period.startsAt);
    const resetTime = time(period.resetsAt);
    const nextStart = periods
      .map((candidate) => time(candidate.startsAt))
      .filter((candidate) => candidate !== null && candidate > startTime)
      .sort((left, right) => left - right)[0];
    const effectiveEnd = nextStart && nextStart < resetTime ? nextStart : resetTime;
    return { ...period, endsAt: new Date(effectiveEnd).toISOString() };
  });
}

function clusterContainsLatest(period, latest) {
  const reset = time(latest?.resetsAt);
  return reset !== null
    && Number(period.windowMinutes) === Number(latest.windowMinutes)
    && Math.abs(time(period.resetsAt) - reset) <= QUOTA_RESET_CLUSTER_MS;
}
