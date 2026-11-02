export function normalizeQuotaPlan(value) {
  return String(value || '').trim().toLowerCase().slice(0, 80) || null;
}

// Keep dated capacity boundaries across repeated per-session/account/hub merges.
// Percentages stay as reported; a plan change never invents a weekly reset.
export function mergeQuotaPlans(items) {
  const types = [], byTime = new Map();
  for (const item of items) {
    for (const value of [...(item.planTypes || []), item.planType]) {
      const plan = normalizeQuotaPlan(value);
      if (plan && types.at(-1) !== plan) types.push(plan);
    }
    const changes = item.planChanges?.length ? item.planChanges : item.planType && !(item.planTypes?.length > 1)
      ? [{observedAt:item.firstObservedAt || item.observations?.[0]?.observedAt || item.observedAt,
        usedPercent:item.observations?.[0]?.usedPercent ?? item.usedPercent, planType:item.planType}] : [];
    for (const change of changes) {
      const time = Date.parse(change.observedAt), planType = normalizeQuotaPlan(change.planType);
      if (Number.isFinite(time) && planType && Number.isFinite(change.usedPercent))
        byTime.set(time, {observedAt:new Date(time).toISOString(), usedPercent:change.usedPercent, planType});
    }
  }
  const changes = [...byTime.values()].sort((a,b)=>Date.parse(a.observedAt)-Date.parse(b.observedAt));
  const planChanges = changes.filter((change,index)=>index === 0 || change.planType !== changes[index-1].planType);
  // Older summaries may contain types without dated boundaries. Retain them.
  const datedTypes = planChanges.map(change=>change.planType);
  const planTypes = datedTypes.length && types.every(type=>datedTypes.includes(type))
    ? datedTypes : [...new Set([...types, ...datedTypes])];
  return {planTypes, ...(planChanges.length ? {planChanges} : {})};
}

export function quotaPlanSegment(quota = {}) {
  const changes = quota.planChanges || [];
  const changed = changes.length > 1 || new Set(quota.planTypes || []).size > 1;
  const last = changes.at(-1);
  return {changed, planType:normalizeQuotaPlan(quota.planType),
    startsAt:changed ? (last?.observedAt || quota.observedAt) : quota.startsAt,
    baselinePercent:changed ? (last?.usedPercent ?? quota.usedPercent) : 0};
}

export function validQuotaPlanChanges(quota) {
  return quota.planChanges === undefined || Array.isArray(quota.planChanges)
    && quota.planChanges.length <= 500 && quota.planChanges.every(change=>change && typeof change === 'object'
      && Object.keys(change).every(key=>['observedAt','usedPercent','planType'].includes(key))
      && typeof change.observedAt === 'string' && Number.isFinite(Date.parse(change.observedAt))
      && typeof change.planType === 'string' && /^[a-z0-9_-]{1,80}$/.test(change.planType)
      && Number.isFinite(change.usedPercent) && change.usedPercent >= 0 && change.usedPercent <= 100);
}
