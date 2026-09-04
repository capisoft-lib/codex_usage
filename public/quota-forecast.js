export const FORECAST_HOUR_MS = 60 * 60 * 1_000;
export const DEFAULT_EMA_HALF_LIFE_HOURS = 24;
export const DEFAULT_LOOKBACK_HOURS = 28 * 24;
export const DEFAULT_CAPACITY_HALF_LIFE_PERIODS = 2;

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function validTime(value) {
  const time = typeof value === "number" ? value : value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizedSamples(samples, from, to) {
  return (samples || [])
    .map((sample) => ({ time: validTime(sample?.timestamp), value: finiteNonNegative(sample?.value) }))
    .filter((sample) => sample.time !== null && sample.time >= from && sample.time <= to && sample.value > 0)
    .sort((left, right) => left.time - right.time);
}

function hasUnratedSamples(samples, from, to) {
  return samples.some((sample) => sample?.rated === false && (validTime(sample.timestamp) === null || (validTime(sample.timestamp) >= from && validTime(sample.timestamp) <= to)));
}

function comparableQuota(period, planType, nodeId) {
  const expectedPlan = String(planType || "").trim().toLowerCase();
  const periodPlan = String(period?.planType || "").trim().toLowerCase();
  if (expectedPlan && periodPlan && expectedPlan !== periodPlan) return false;
  if (nodeId && period?.nodeId && nodeId !== period.nodeId) return false;
  return true;
}

export function exponentialWeightedAverage(values, halfLifePeriods = DEFAULT_EMA_HALF_LIFE_HOURS) {
  const safeHalfLife = Math.max(1, finiteNonNegative(halfLifePeriods));
  if (!Array.isArray(values) || !values.length) return 0;
  let weighted = 0;
  let weightTotal = 0;
  for (let index = 0; index < values.length; index += 1) {
    const age = values.length - index - 1;
    const weight = 2 ** (-age / safeHalfLife);
    weighted += finiteNonNegative(values[index]) * weight;
    weightTotal += weight;
  }
  return weightTotal ? weighted / weightTotal : 0;
}

export function weeklyForecastTicks(rangeStart, rangeEnd) {
  const startTime = validTime(rangeStart);
  const endTime = validTime(rangeEnd);
  if (startTime === null || endTime === null || endTime <= startTime) return [];
  const midnight = new Date(startTime);
  midnight.setHours(0, 0, 0, 0);
  if (midnight.getTime() < startTime) midnight.setDate(midnight.getDate() + 1);

  const ticks = [];
  while (midnight.getTime() <= endTime) {
    ticks.push(midnight.getTime());
    midnight.setDate(midnight.getDate() + 1);
  }
  return ticks;
}

export function interpolateForecastPercent(points, timestamp) {
  const targetTime = validTime(timestamp);
  const values = (points || [])
    .map((point) => ({ time: validTime(point?.timestamp), percent: Number(point?.percent) }))
    .filter((point) => point.time !== null && Number.isFinite(point.percent))
    .sort((left, right) => left.time - right.time);
  if (targetTime === null || !values.length) return null;
  if (targetTime <= values[0].time) return values[0].percent;
  if (targetTime >= values.at(-1).time) return values.at(-1).percent;

  const rightIndex = values.findIndex((point) => point.time >= targetTime);
  const left = values[rightIndex - 1];
  const right = values[rightIndex];
  if (right.time === left.time) return right.percent;
  const ratio = (targetTime - left.time) / (right.time - left.time);
  return left.percent + (right.percent - left.percent) * ratio;
}

export function estimateQuotaCapacityCredits({
  samples = [],
  quotaPeriods = [],
  planType = null,
  nodeId = null,
  halfLifePeriods = DEFAULT_CAPACITY_HALF_LIFE_PERIODS,
} = {}) {
  const estimates = (quotaPeriods || []).filter((period) => comparableQuota(period, planType, nodeId)).map((period) => {
    const startTime = validTime(period?.startsAt);
    const observedTime = validTime(period?.peakObservedAt || period?.observedAt);
    const usedPercent = Number(period?.peakUsedPercent ?? period?.usedPercent);
    if (startTime === null || observedTime === null || observedTime <= startTime || !Number.isFinite(usedPercent) || usedPercent <= 0) return null;
    if (hasUnratedSamples(samples, startTime, observedTime)) return null;
    const consumedCredits = normalizedSamples(samples, startTime, observedTime).reduce((sum, sample) => sum + sample.value, 0);
    if (consumedCredits <= 0) return null;
    return { observedTime, capacityCredits: consumedCredits * 100 / usedPercent };
  }).filter(Boolean).sort((left, right) => left.observedTime - right.observedTime);

  if (!estimates.length) return null;
  return exponentialWeightedAverage(estimates.map((estimate) => estimate.capacityCredits), halfLifePeriods);
}

function rollingHourlyValues(samples, anchorTime, lookbackHours) {
  const maximumCount = Math.max(1, Math.floor(finiteNonNegative(lookbackHours)) || DEFAULT_LOOKBACK_HOURS);
  const available = normalizedSamples(samples, anchorTime - maximumCount * FORECAST_HOUR_MS, anchorTime);
  if (!available.length) return [];
  const observedHours = Math.floor((anchorTime - available[0].time) / FORECAST_HOUR_MS) + 1;
  const count = Math.min(maximumCount, Math.max(1, observedHours));
  const values = Array(count).fill(0);
  for (const sample of available) {
    const age = Math.min(count - 1, Math.floor((anchorTime - sample.time) / FORECAST_HOUR_MS));
    values[count - age - 1] += sample.value;
  }
  return values;
}

function cumulativePoints(samples, startTime, anchorTime, usedPercent, currentCredits) {
  const points = [{ timestamp: new Date(startTime).toISOString(), percent: 0 }];
  const count = Math.max(1, Math.ceil((anchorTime - startTime) / FORECAST_HOUR_MS));
  let cursor = 0;
  let cumulative = 0;
  for (let index = 1; index <= count; index += 1) {
    const boundary = Math.min(anchorTime, startTime + index * FORECAST_HOUR_MS);
    while (cursor < samples.length && samples[cursor].time <= boundary) {
      cumulative += samples[cursor].value;
      cursor += 1;
    }
    points.push({
      timestamp: new Date(boundary).toISOString(),
      percent: boundary === anchorTime ? usedPercent : currentCredits > 0 ? cumulative / currentCredits * usedPercent : 0,
    });
    if (boundary === anchorTime) break;
  }
  return points;
}

function projectedPoints(anchorTime, endTime, usedPercent, percentPerHour) {
  const points = [{ timestamp: new Date(anchorTime).toISOString(), percent: usedPercent }];
  const count = Math.max(0, Math.ceil((endTime - anchorTime) / FORECAST_HOUR_MS));
  for (let index = 1; index <= count; index += 1) {
    const boundary = Math.min(endTime, anchorTime + index * FORECAST_HOUR_MS);
    points.push({
      timestamp: new Date(boundary).toISOString(),
      percent: usedPercent + (boundary - anchorTime) / FORECAST_HOUR_MS * percentPerHour,
    });
    if (boundary === endTime) break;
  }
  return points;
}

export function buildQuotaForecast({
  samples = [],
  rangeStart,
  rangeEnd,
  observedAt,
  asOf = observedAt,
  usedPercent,
  project = true,
  halfLifeHours = DEFAULT_EMA_HALF_LIFE_HOURS,
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
  capacityCredits = null,
} = {}) {
  const startTime = validTime(rangeStart);
  const endTime = validTime(rangeEnd);
  const observationTime = validTime(observedAt);
  const asOfTime = validTime(asOf);
  const hasUsedPercent = usedPercent !== null && usedPercent !== undefined && usedPercent !== "";
  const parsedUsedPercent = Number(usedPercent);
  const safeUsedPercent = finiteNonNegative(parsedUsedPercent);
  if (startTime === null || endTime === null || observationTime === null || asOfTime === null || endTime <= startTime) {
    return { status: "unavailable" };
  }
  const observedAnchorTime = Math.min(endTime, observationTime);
  const anchorTime = Math.min(endTime, Math.max(observedAnchorTime, asOfTime));
  if (observedAnchorTime <= startTime || !hasUsedPercent || !Number.isFinite(parsedUsedPercent) || parsedUsedPercent < 0) return { status: "insufficient" };

  const partialHistory = hasUnratedSamples(samples, startTime, anchorTime);
  const observedSamples = normalizedSamples(samples, startTime, observedAnchorTime);
  const currentCredits = observedSamples.reduce((sum, sample) => sum + sample.value, 0);
  const historicalCapacityCredits = finiteNonNegative(capacityCredits);
  const currentCapacityCredits = !partialHistory && safeUsedPercent > 0 && currentCredits > 0 ? currentCredits * 100 / safeUsedPercent : 0;
  const calibratedCapacityCredits = historicalCapacityCredits || currentCapacityCredits;
  if (calibratedCapacityCredits <= 0) return { status: "insufficient", ...(partialHistory ? { reason: "unrated-usage" } : {}) };

  // Old gaps must not suppress a fully priced selected window. Use only the
  // contiguous, fully priced hourly history after the most recent gap.
  const requestedHours = Math.max(1, Math.floor(finiteNonNegative(lookbackHours)) || DEFAULT_LOOKBACK_HOURS);
  const historyStart = anchorTime - requestedHours * FORECAST_HOUR_MS;
  const latestGap = samples.reduce((latest, sample) => {
    const time = validTime(sample?.timestamp);
    return sample?.rated === false && time !== null && time >= historyStart && time <= anchorTime ? Math.max(latest, time) : latest;
  }, -Infinity);
  const availableHours = Number.isFinite(latestGap) ? Math.min(requestedHours, Math.floor((anchorTime - latestGap) / FORECAST_HOUR_MS)) : requestedHours;
  if (availableHours < 1) return { status: "insufficient", reason: "unrated-usage" };
  const historySamples = Number.isFinite(latestGap) ? samples.filter((sample) => validTime(sample?.timestamp) > latestGap) : samples;
  const hourlyValues = rollingHourlyValues(historySamples, anchorTime, availableHours);
  if (!hourlyValues.length) return { status: "insufficient" };
  const creditsPerHour = exponentialWeightedAverage(hourlyValues, halfLifeHours);
  const quotaPercentPerCredit = 100 / calibratedCapacityCredits;
  const percentPerHour = creditsPerHour * quotaPercentPerCredit;
  const remainingHours = Math.max(0, (endTime - anchorTime) / FORECAST_HOUR_MS);
  const shouldProject = project !== false && anchorTime < endTime;
  const expectedFinalPercent = shouldProject ? safeUsedPercent + remainingHours * percentPerHour : safeUsedPercent;
  const actual = partialHistory
    ? [{ timestamp: new Date(observedAnchorTime).toISOString(), percent: safeUsedPercent }]
    : cumulativePoints(observedSamples, startTime, observedAnchorTime, safeUsedPercent, currentCredits);
  if (anchorTime > observedAnchorTime) {
    actual.push({ timestamp: new Date(anchorTime).toISOString(), percent: safeUsedPercent });
  }

  return {
    status: "ready",
    rangeStart: new Date(startTime).toISOString(),
    rangeEnd: new Date(endTime).toISOString(),
    observedAt: new Date(observedAnchorTime).toISOString(),
    asOf: new Date(anchorTime).toISOString(),
    usedPercent: safeUsedPercent,
    currentCredits,
    capacityCredits: calibratedCapacityCredits,
    calibrationSource: historicalCapacityCredits > 0 ? "history" : "current",
    partialHistory,
    historyHours: hourlyValues.length,
    creditsPerHour,
    creditsPerDay: creditsPerHour * 24,
    expectedFinalPercent,
    marginPercent: 100 - expectedFinalPercent,
    halfLifeHours: Math.max(1, finiteNonNegative(halfLifeHours)),
    completed: !shouldProject,
    actual,
    projected: shouldProject ? projectedPoints(anchorTime, endTime, safeUsedPercent, percentPerHour) : [],
  };
}
