function usageCounters(usage = {}) {
  return {
    inputTokens: usage.inputTokens || 0,
    cachedInputTokens: usage.cachedInputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    reasoningOutputTokens: usage.reasoningOutputTokens || 0,
    totalTokens: usage.totalTokens || 0,
  };
}

function publicCall(call = {}) {
  return {
    timestamp: call.timestamp || null,
    turnId: call.turnId || null,
    model: call.model || "unknown",
    effort: call.effort || null,
    serviceTier: call.serviceTier || "default",
    usage: usageCounters(call.usage),
  };
}

function publicTurn(turn = {}) {
  return {
    id: turn.id || null,
    startedAt: turn.startedAt || null,
    completedAt: turn.completedAt || null,
    durationMs: turn.durationMs ?? null,
    model: turn.model || "unknown",
    effort: turn.effort || null,
    serviceTier: turn.serviceTier || "default",
    calls: turn.calls || 0,
    usage: usageCounters(turn.usage),
  };
}

function publicSession(session = {}) {
  return {
    id: session.id,
    title: session.title,
    startedAt: session.startedAt || null,
    updatedAt: session.updatedAt || null,
    cwd: session.cwd || null,
    source: session.source || "unknown",
    cliVersion: session.cliVersion || null,
    modelProvider: session.modelProvider || null,
    models: Array.isArray(session.models) ? session.models : [],
    exchanges: session.exchanges || 0,
    completedExchanges: session.completedExchanges || 0,
    userMessages: session.userMessages || 0,
    assistantMessages: session.assistantMessages || 0,
    modelCalls: session.modelCalls || 0,
    durationMs: session.durationMs || 0,
    usage: usageCounters(session.usage),
    turns: (session.turns || []).map(publicTurn),
    calls: (session.calls || []).map(publicCall),
    parseErrors: session.parseErrors || 0,
  };
}

function publicSource(source) {
  if (!source) return null;
  return {
    mode: source.mode || "local",
    sessionsAvailable: Boolean(source.sessionsAvailable),
    archivedSessionsAvailable: Boolean(source.archivedSessionsAvailable),
    sessionIndexAvailable: Boolean(source.sessionIndexAvailable),
  };
}

function publicWeeklyQuota(quota) {
  if (!quota) return null;
  return {
    usedPercent: quota.usedPercent ?? null,
    remainingPercent: quota.remainingPercent ?? null,
    windowMinutes: quota.windowMinutes ?? null,
    resetsAt: quota.resetsAt || null,
    resetsAvailable: quota.resetsAvailable ?? null,
    observedAt: quota.observedAt || null,
    planType: quota.planType || null,
  };
}

export function toPublicUsage(data) {
  return {
    analyzerVersion: data.analyzerVersion,
    generatedAt: data.generatedAt,
    source: publicSource(data.source),
    weeklyQuota: publicWeeklyQuota(data.weeklyQuota),
    sessions: (data.sessions || []).map(publicSession),
    errorCount: Array.isArray(data.errors) ? data.errors.length : 0,
  };
}

export function serializePublicUsage(data) {
  return JSON.stringify(toPublicUsage(data));
}
