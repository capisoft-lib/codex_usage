// Only expiry dates and quantities are shared; reset-credit identifiers stay local.
export function validResetDeadlineMetadata(quota) {
  if (quota.resetDeadlines === undefined && quota.resetDeadlinesObservedAt === undefined) return true;
  if (typeof quota.resetDeadlinesObservedAt !== "string" || !Number.isFinite(Date.parse(quota.resetDeadlinesObservedAt))) return false;
  return quota.resetDeadlines === null || Array.isArray(quota.resetDeadlines)
    && quota.resetDeadlines.length <= 500 && quota.resetDeadlines.every(item => item && typeof item === "object"
      && !Array.isArray(item) && Object.keys(item).every(key => key === "expiresAt" || key === "count")
      && typeof item.expiresAt === "string" && /Z$/.test(item.expiresAt) && Number.isFinite(Date.parse(item.expiresAt))
      && Number.isSafeInteger(item.count) && item.count > 0);
}

export function latestResetDeadlineMetadata(items) {
  // Older collectors omit these fields. They must not erase a newer collector's
  // account reading merely because they reported quota usage a few seconds later.
  const known = items.filter(item => item?.resetDeadlines !== undefined && validResetDeadlineMetadata(item));
  const latest = known.sort((a, b) => Date.parse(a.resetDeadlinesObservedAt) - Date.parse(b.resetDeadlinesObservedAt)).at(-1);
  return latest ? { resetDeadlines: latest.resetDeadlines, resetDeadlinesObservedAt: latest.resetDeadlinesObservedAt } : {};
}

export function availableResetDeadlines(quota, now = Date.now()) {
  return (Array.isArray(quota?.resetDeadlines) ? quota.resetDeadlines : [])
    .filter(item => Date.parse(item.expiresAt) > now && Number.isSafeInteger(item.count) && item.count > 0)
    .sort((a, b) => Date.parse(a.expiresAt) - Date.parse(b.expiresAt));
}
