import { DASHBOARD_API_VERSION } from "./dashboard-contract.mjs";

function usageCounters(usage = {}) {
  return {
    inputTokens: usage.inputTokens || 0,
    cachedInputTokens: usage.cachedInputTokens || 0,
    outputTokens: usage.outputTokens || 0,
    reasoningOutputTokens: usage.reasoningOutputTokens || 0,
    totalTokens: usage.totalTokens || 0,
    ...(Object.hasOwn(usage, "cacheWriteInputTokens") ? { cacheWriteInputTokens: usage.cacheWriteInputTokens } : {}),
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
    sourceSessionId: session.sourceSessionId || null,
    nodeId: session.nodeId || null,
    nodeAlias: session.nodeAlias || null,
    title: session.title,
    startedAt: session.startedAt || null,
    updatedAt: session.updatedAt || null,
    cwd: session.cwd || null,
    projectName: session.projectName || null,
    projectGitHubUrl: session.projectGitHubUrl || null,
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

function publicQuota(quota) {
  if (!quota) return null;
  return {
    usedPercent: quota.usedPercent ?? null,
    remainingPercent: quota.remainingPercent ?? null,
    peakUsedPercent: quota.peakUsedPercent ?? quota.usedPercent ?? null,
    windowMinutes: quota.windowMinutes ?? null,
    startsAt: quota.startsAt || null,
    endsAt: quota.endsAt || quota.resetsAt || null,
    resetsAt: quota.resetsAt || null,
    resetsAvailable: quota.resetsAvailable ?? null,
    observedAt: quota.observedAt || null,
    firstObservedAt: quota.firstObservedAt || null,
    peakObservedAt: quota.peakObservedAt || quota.observedAt || null,
    planType: quota.planType || null,
    planTypes: Array.isArray(quota.planTypes) ? quota.planTypes.filter((value) => typeof value === "string").slice(0, 20) : [],
    nodeId: quota.nodeId || null,
    nodeAlias: quota.nodeAlias || null,
    receivedAt: quota.receivedAt || null,
    ...(Array.isArray(quota.observations) ? { observations: quota.observations.map((point) => ({
      observedAt: point.observedAt, usedPercent: point.usedPercent,
    })) } : {}),
  };
}

function publicNode(node = {}) {
  return {
    id: node.id,
    alias: node.alias,
    enrolledAt: node.enrolledAt || null,
    lastSeen: node.lastSeen || null,
    lastGeneratedAt: node.lastGeneratedAt || null,
    revokedAt: node.revokedAt || null,
    sessionCount: node.sessionCount || 0,
    privacy: node.privacy && {
      projectMode: node.privacy.projectMode,
      includeTitles: Boolean(node.privacy.includeTitles),
    },
  };
}

export function toPublicUsage(data) {
  return {
    apiVersion: DASHBOARD_API_VERSION,
    analyzerVersion: data.analyzerVersion,
    generatedAt: data.generatedAt,
    source: publicSource(data.source),
    fiveHourQuota: publicQuota(data.fiveHourQuota),
    weeklyQuota: publicQuota(data.weeklyQuota),
    weeklyQuotaHistory: (data.weeklyQuotaHistory || []).map(publicQuota).filter(Boolean),
    nodes: (data.nodes || []).map(publicNode),
    sessions: (data.sessions || []).map(publicSession),
    errorCount: Array.isArray(data.errors) ? data.errors.length : 0,
  };
}

export function serializePublicUsage(data) {
  return JSON.stringify(toPublicUsage(data));
}
