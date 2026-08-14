export const FORECAST_HOUR_MS = 60 * 60 * 1_000;
export const DEFAULT_EMA_HALF_LIFE_HOURS = 24;
export const DEFAULT_LOOKBACK_HOURS = 28 * 24;

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function validTime(value) {
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function normalizedSamples(samples, from, to) {
  return (samples || [])
    .map((sample) => ({ time: validTime(sample?.timestamp), value: finiteNonNegative(sample?.value) }))
    .filter((sample) => sample.time !== null && sample.time >= from && sample.time <= to && sample.value > 0)
    .sort((left, right) => left.time - right.time);
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
      percent: boundary === anchorTime ? usedPercent : cumulative / currentCredits * usedPercent,
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
  usedPercent,
  halfLifeHours = DEFAULT_EMA_HALF_LIFE_HOURS,
  lookbackHours = DEFAULT_LOOKBACK_HOURS,
} = {}) {
  const startTime = validTime(rangeStart);
  const endTime = validTime(rangeEnd);
  const observationTime = validTime(observedAt);
  const safeUsedPercent = finiteNonNegative(usedPercent);
  if (startTime === null || endTime === null || observationTime === null || endTime <= startTime) {
    return { status: "unavailable" };
  }
  const anchorTime = Math.min(endTime, observationTime);
  if (anchorTime <= startTime || safeUsedPercent <= 0) return { status: "insufficient" };

  const currentSamples = normalizedSamples(samples, startTime, anchorTime);
  const currentCredits = currentSamples.reduce((sum, sample) => sum + sample.value, 0);
  if (currentCredits <= 0) return { status: "insufficient" };

  const hourlyValues = rollingHourlyValues(samples, anchorTime, lookbackHours);
  const creditsPerHour = exponentialWeightedAverage(hourlyValues, halfLifeHours);
  const quotaPercentPerCredit = safeUsedPercent / currentCredits;
  const percentPerHour = creditsPerHour * quotaPercentPerCredit;
  const remainingHours = Math.max(0, (endTime - anchorTime) / FORECAST_HOUR_MS);
  const expectedFinalPercent = safeUsedPercent + remainingHours * percentPerHour;

  return {
    status: "ready",
    rangeStart: new Date(startTime).toISOString(),
    rangeEnd: new Date(endTime).toISOString(),
    observedAt: new Date(anchorTime).toISOString(),
    usedPercent: safeUsedPercent,
    currentCredits,
    creditsPerHour,
    creditsPerDay: creditsPerHour * 24,
    expectedFinalPercent,
    marginPercent: 100 - expectedFinalPercent,
    halfLifeHours: Math.max(1, finiteNonNegative(halfLifeHours)),
    actual: cumulativePoints(currentSamples, startTime, anchorTime, safeUsedPercent, currentCredits),
    projected: projectedPoints(anchorTime, endTime, safeUsedPercent, percentPerHour),
  };
}
