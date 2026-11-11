const HOUR_MS = 60 * 60_000;
const MAX_READINGS = 512;

function validCreditObservation(point) {
  return point && Object.keys(point).length === 2 && typeof point.observedAt === "string"
    && Number.isFinite(Date.parse(point.observedAt)) && Number.isFinite(point.balance) && point.balance >= 0;
}

export function validCreditBalanceHistory(quota) {
  const points = quota.creditBalanceObservations;
  return points === undefined || Array.isArray(points) && points.length <= MAX_READINGS && points.every(validCreditObservation);
}

// Keep the opening reading and the last reading of each hour. Multiple machines
// can report the same account balance, so readings are never added together.
export function mergeCreditBalanceHistory(quotas, start = -Infinity, end = Infinity) {
  const hours = new Map();
  let first = null;
  for (const quota of quotas) {
    for (const point of quota?.creditBalanceObservations || []) {
      if (!validCreditObservation(point)) continue;
      const time = Date.parse(point.observedAt);
      if (time < start || time > end) continue;
      const reading = { time, observedAt: new Date(time).toISOString(), balance: point.balance };
      if (!first || time <= first.time) first = reading;
      const hour = Math.floor(time / HOUR_MS);
      const prior = hours.get(hour);
      if (!prior || time >= prior.time) hours.set(hour, reading);
    }
  }
  if (!first) return {};
  const readings = [...hours.values()].sort((a, b) => a.time - b.time).slice(1 - MAX_READINGS);
  if (first.time < readings[0].time) readings.unshift(first);
  return { creditBalanceObservations: readings.map(({ observedAt, balance }) => ({ observedAt, balance })) };
}
