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
