export const FORECAST_HOUR_MS = 60 * 60 * 1_000;
export const DEFAULT_EMA_HALF_LIFE_HOURS = 24;
export const DEFAULT_LOOKBACK_HOURS = 30 * 24;
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

export function interpolateForecastPercent(points, timestamp, { clamp = true } = {}) {
  const targetTime = validTime(timestamp);
  const values = (points || [])
    .map((point) => ({ time: validTime(point?.timestamp), percent: Number(point?.percent) }))
    .filter((point) => point.time !== null && Number.isFinite(point.percent))
    .sort((left, right) => left.time - right.time);
  if (targetTime === null || !values.length) return null;
  if (!clamp && (targetTime < values[0].time || targetTime > values.at(-1).time)) return null;
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

// Integrate time weights over measured intervals, rather than weighting each
// sample equally: dense polling must not change the forecast. Never extend a
// measurement to now or invent a zero-percent observation at the window start.
export function measuredQuotaPace(points, asOf, halfLifeHours = DEFAULT_EMA_HALF_LIFE_HOURS) {
  const now = validTime(asOf);
  const last = points.at(-1);
  if (!last || now === null || now - validTime(last.timestamp) > 24 * FORECAST_HOUR_MS) return { reason: "stale-observations" };
  let start = 0;
  for (let i = 1; i < points.length; i += 1) {
    if (points[i].percent < points[i - 1].percent) start = i;
  }
  const recent = points.slice(start);
  const end = validTime(last.timestamp);
  if (recent.length < 2 || end - validTime(recent[0].timestamp) < FORECAST_HOUR_MS) return { reason: "short-observation-history" };
  const decay = Math.LN2 / Math.max(1, finiteNonNegative(halfLifeHours));
  let weighted = 0;
  let total = 0;
  let coveredHours = 0;
  for (let i = 1; i < recent.length; i += 1) {
    const left = recent[i - 1];
    const right = recent[i];
    const hours = (validTime(right.timestamp) - validTime(left.timestamp)) / FORECAST_HOUR_MS;
    // A large gap hides changes of pace; restart the usable history after it.
    // A saturated quota also cannot measure additional consumption.
    if (hours > 24 || left.percent >= 100) { weighted = 0; total = 0; coveredHours = 0; continue; }
    if (hours <= 0) continue;
    const age = (end - validTime(right.timestamp)) / FORECAST_HOUR_MS;
    const weight = Math.exp(-decay * age) * (-Math.expm1(-decay * hours)) / decay;
    weighted += (right.percent - left.percent) / hours * weight;
    total += weight;
    coveredHours += hours;
  }
  if (coveredHours < 1 || total <= 0) return { reason: "short-observation-history" };
  return { percentPerHour: weighted / total };
}

function buildLegacyQuotaForecast({
  samples = [],
  observations = [],
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

  const shouldProject = project !== false && anchorTime < endTime;
  const partialHistory = hasUnratedSamples(samples, startTime, anchorTime);
  const observedSamples = normalizedSamples(samples, startTime, observedAnchorTime);
  const currentCredits = observedSamples.reduce((sum, sample) => sum + sample.value, 0);
  const measuredByTime = new Map();
  for (const point of observations || []) {
    const time = validTime(point?.observedAt);
    if (time !== null && time >= startTime && time <= observedAnchorTime
      && Number.isFinite(point.usedPercent) && point.usedPercent >= 0 && point.usedPercent <= 100) {
      measuredByTime.set(time, { timestamp: new Date(time).toISOString(), percent: point.usedPercent });
    }
  }
  const measured = [...measuredByTime.entries()].sort((a, b) => a[0] - b[0]).map(([, point]) => point);
  const measuredPace = measuredQuotaPace(measured, anchorTime, halfLifeHours);
  const historySource = measured.length ? "observed" : "estimated";
  const actual = measured.length ? [...measured] : cumulativePoints(observedSamples, startTime, observedAnchorTime, safeUsedPercent, currentCredits);
  const lastObservedAt = actual.at(-1).timestamp;
  // Carry the latest known quota to now, or to the end of a completed window.
  // Keep the observation timestamp separate from this display-only plateau.
  if ((anchorTime === endTime || project !== false || !measured.length) && anchorTime > validTime(lastObservedAt)) {
    actual.push({ timestamp: new Date(anchorTime).toISOString(), percent: actual.at(-1).percent });
  }
  const historyOnly = (reason) => measured.length ? {
    status: "ready", rangeStart: new Date(startTime).toISOString(), rangeEnd: new Date(endTime).toISOString(),
    observedAt: lastObservedAt, asOf: new Date(anchorTime).toISOString(), usedPercent: safeUsedPercent,
    historySource, partialHistory, actual, projected: [], completed: !shouldProject,
    projectionUnavailable: shouldProject, expectedFinalPercent: actual.at(-1).percent, reason,
  } : { status: "insufficient", ...(reason ? { reason } : {}) };
  const withoutCreditCalibration = (reason = "missing-calibration") => {
    if (!shouldProject || !measured.length) return historyOnly(reason);
    if (!Number.isFinite(measuredPace.percentPerHour)) return historyOnly(measuredPace.reason);
    if (measured.at(-1).percent !== safeUsedPercent) return historyOnly("inconsistent-observations");
    const percentPerHour = measuredPace.percentPerHour;
    const expectedFinalPercent = safeUsedPercent + (endTime - anchorTime) / FORECAST_HOUR_MS * percentPerHour;
    return {
      ...historyOnly(), projectionUnavailable: false, reason: undefined,
      calibrationSource: "observations", percentPerHour, percentPerDay: percentPerHour * 24,
      halfLifeHours: Math.max(1, finiteNonNegative(halfLifeHours)),
      expectedFinalPercent, marginPercent: 100 - expectedFinalPercent,
      projected: projectedPoints(anchorTime, endTime, safeUsedPercent, percentPerHour),
    };
  };
  const historicalCapacityCredits = finiteNonNegative(capacityCredits);
  const currentCapacityCredits = (!partialHistory || !shouldProject) && safeUsedPercent > 0 && currentCredits > 0 ? currentCredits * 100 / safeUsedPercent : 0;
  const calibratedCapacityCredits = historicalCapacityCredits || currentCapacityCredits;
  if (calibratedCapacityCredits <= 0) return withoutCreditCalibration(partialHistory ? "unrated-usage" : undefined);

  // Old gaps must not suppress a fully priced selected window. Use only the
  // contiguous, fully priced hourly history after the most recent gap.
  const requestedHours = Math.max(1, Math.floor(finiteNonNegative(lookbackHours)) || DEFAULT_LOOKBACK_HOURS);
  const historyStart = anchorTime - requestedHours * FORECAST_HOUR_MS;
  const latestGap = samples.reduce((latest, sample) => {
    const time = validTime(sample?.timestamp);
    return sample?.rated === false && time !== null && time >= historyStart && time <= anchorTime ? Math.max(latest, time) : latest;
  }, -Infinity);
  const availableHours = Number.isFinite(latestGap) ? Math.min(requestedHours, Math.floor((anchorTime - latestGap) / FORECAST_HOUR_MS)) : requestedHours;
  if (shouldProject && availableHours < 1) return withoutCreditCalibration("unrated-usage");
  const historySamples = Number.isFinite(latestGap) ? samples.filter((sample) => validTime(sample?.timestamp) > latestGap) : samples;
  const hourlyValues = shouldProject ? rollingHourlyValues(historySamples, anchorTime, availableHours) : [];
  if (shouldProject && !hourlyValues.length) return withoutCreditCalibration();
  const creditsPerHour = exponentialWeightedAverage(hourlyValues, halfLifeHours);
  const quotaPercentPerCredit = 100 / calibratedCapacityCredits;
  const percentPerHour = creditsPerHour * quotaPercentPerCredit;
  const remainingHours = Math.max(0, (endTime - anchorTime) / FORECAST_HOUR_MS);
  const expectedFinalPercent = shouldProject ? safeUsedPercent + remainingHours * percentPerHour : safeUsedPercent;

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
    historySource,
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


// Calculate a measured rate only over intervals actually observed in a quota
// window. Never bridge resets, long outages, or saturated quota readings.
export function measuredHistoricalQuotaPace(periods, from, to, planType = null, nodeId = null) {
  let coveredHours = 0, increase = 0;
  for (const period of periods || []) {
    if (!comparableQuota(period, planType, nodeId)) continue;
    const points = (period.observations || []).map(p => ({time:validTime(p.observedAt), value:Number(p.usedPercent)}))
      .filter(p => p.time !== null && Number.isFinite(p.value) && p.value >= 0 && p.value <= 100)
      .sort((a,b) => a.time - b.time);
    for (let i = 1; i < points.length; i++) {
      const left = points[i-1], right = points[i], hours = (right.time-left.time)/FORECAST_HOUR_MS;
      if (hours <= 0 || hours > 24 || right.value < left.value || right.value >= 100) continue;
      const overlap = Math.max(0, Math.min(to,right.time) - Math.max(from,left.time)) / FORECAST_HOUR_MS;
      if (!overlap) continue;
      coveredHours += overlap;
      increase += (right.value-left.value) * overlap / hours;
    }
  }
  return coveredHours >= 24 ? { percentPerHour: increase / coveredHours, historyHours: coveredHours } : null;
}

// Keep the old EMA fields for consumers of the API; the dashboard displays these
// two explicitly named, independent projections instead.
export function buildQuotaForecast(options = {}) {
  let result = buildLegacyQuotaForecast(options);
  if (result.status === "insufficient" && options.project !== false) {
    const start = validTime(options.rangeStart), end = validTime(options.rangeEnd), observed = validTime(options.observedAt), asOf = validTime(options.asOf ?? options.observedAt);
    const used = Number(options.usedPercent);
    if (start !== null && end !== null && observed !== null && asOf !== null && observed > start && end > observed && options.usedPercent != null && options.usedPercent !== "" && Number.isFinite(used) && used >= 0) {
      const anchor = Math.min(end, Math.max(observed, asOf));
      const actual = [{ timestamp: new Date(observed).toISOString(), percent: used }];
      if (anchor > observed) actual.push({ timestamp: new Date(anchor).toISOString(), percent: used });
      result = { ...result, status: "ready", rangeStart: new Date(start).toISOString(), rangeEnd: new Date(end).toISOString(), observedAt: new Date(observed).toISOString(), asOf: new Date(anchor).toISOString(), usedPercent: used, historySource: "observed", actual, projected: [], expectedFinalPercent: used, projectionUnavailable: true, completed: anchor >= end, capacityCredits: Number(options.capacityCredits) || 0 };
    }
  }
  if (result.status !== "ready" || result.completed) return result;
  const start = validTime(options.rangeStart), observed = validTime(options.observedAt);
  const anchor = validTime(result.asOf), end = validTime(options.rangeEnd);
  const used = Number(options.usedPercent);
  const fresh = observed !== null && anchor - observed <= 24 * FORECAST_HOUR_MS;
  const elapsed = (observed - start) / FORECAST_HOUR_MS;
  const currentRate = fresh && elapsed >= 1 && used < 100 ? used / elapsed : null;
  const makeProjection = rate => rate === null || !Number.isFinite(rate) ? null : ({
    percentPerHour: rate, expectedFinalPercent: used + (end - anchor) / FORECAST_HOUR_MS * rate,
    projected: projectedPoints(anchor, end, used, rate),
  });
  const current = makeProjection(currentRate);
  const from = anchor - DEFAULT_LOOKBACK_HOURS * FORECAST_HOUR_MS;
  const history = normalizedSamples(options.samples, from, anchor);
  const earliest = history[0]?.time;
  const duration = earliest === undefined ? 0 : Math.min(DEFAULT_LOOKBACK_HOURS, (anchor - earliest) / FORECAST_HOUR_MS);
  const capacity = Number(result.capacityCredits);
  const hasGap = hasUnratedSamples(options.samples || [], from, anchor);
  const historicalRate = fresh && duration >= 24 && !hasGap && capacity > 0
    ? history.reduce((sum, sample) => sum + sample.value, 0) / duration * 100 / capacity : null;
  const measuredHistory = fresh ? measuredHistoricalQuotaPace(options.quotaPeriods, from, anchor, options.planType, options.nodeId) : null;
  const historical = makeProjection(historicalRate ?? measuredHistory?.percentPerHour ?? null);
  if (historical) {
    historical.source = historicalRate !== null ? "credits" : "observations";
    historical.historyHours = historicalRate !== null ? duration : measuredHistory.historyHours;
  }
  return { ...result, forecasts: { current, historical } };
}
