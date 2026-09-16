import { conversationTitle } from './conversation-title.js';
import { apiCostOfCalls, mergeApiPricing } from './api-pricing.js';
import { codexCreditsOfCalls, usageProfilesOfCalls } from './usage-pricing.js';
import { projectIdentity, OVERVIEW_PROJECT_LIMIT } from './project-identity.js';

export function parsePageQuery(value) {
  const q = typeof value === 'string' ? JSON.parse(value) : value;
  if (!q || !['overview', 'projects', 'conversations', 'settings', 'detail', 'pricing'].includes(q.view)) throw new Error('Invalid page');
  const start = q.start == null ? -Infinity : Date.parse(q.start);
  const end = q.end == null ? Infinity : Date.parse(q.end);
  if (Number.isNaN(start) || Number.isNaN(end) || start > end) throw new Error('Invalid range');
  if (q.buckets && (!Array.isArray(q.buckets) || q.buckets.length > 400 || q.buckets.some(b => !Number.isFinite(Date.parse(b.start)) || !Number.isFinite(Date.parse(b.end)) || Date.parse(b.start) >= Date.parse(b.end)))) throw new Error('Invalid buckets');
  return { ...q, start, end, page: Math.max(1, Math.floor(Number(q.page) || 1)), pageSize: Math.min(100, Math.max(1, Math.floor(Number(q.pageSize) || 25))), folders: Array.isArray(q.folders) ? q.folders : [], pricing: mergeApiPricing(q.pricing) };
}

export function pageMetadata(data) {
  const weeklyQuota = { ...data.weeklyQuota }; delete weeklyQuota.observations;
  return { ...data, firstSessionAt: data.firstSessionAt || data.sessions?.map(s=>s.startedAt).filter(Boolean).sort()[0] || null, weeklyQuota: data.weeklyQuota ? weeklyQuota : null, weeklyQuotaHistory: [], sessions: [], quotaOnly: false, pageOnly: true, sessionCount: data.sessionCount ?? data.sessions?.length ?? 0 };
}

function usageOf(calls) {
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 };
  for (const call of calls) for (const key of Object.keys(usage)) usage[key] += call.usage?.[key] || 0;
  return usage;
}
function compactPrice(price) {
  const summary = { ...price };
  delete summary.ratesUsed; delete summary.usageByRate; delete summary.unratedReasons;
  return summary;
}
function summarize(calls, pricing) {
  return { cost: compactPrice(apiCostOfCalls(calls, pricing)), credits: compactPrice(codexCreditsOfCalls(calls)), usage: usageOf(calls), profiles: usageProfilesOfCalls(calls), count: calls.length, lastCall: calls.map(c => c.timestamp).sort().at(-1) || null };
}
function addTotals(target, source) {
  for (const key of Object.keys(source)) if (typeof source[key] === 'number' && !['officialCoverage', 'catalogVersion'].includes(key)) target[key] = (target[key] || 0) + source[key];
  target.complete = target.unratedCalls === 0;
  if ('officialCoverage' in target) target.officialCoverage = target.totalCalls ? (target.ratedCalls - target.estimatedCalls) / target.totalCalls : 1;
}
function mergeSummary(target, source) {
  addTotals(target.cost, source.cost); addTotals(target.credits, source.credits);
  for (const key of Object.keys(target.usage)) target.usage[key] += source.usage[key] || 0;
  target.count += source.count;
  if (source.lastCall > (target.lastCall || '')) target.lastCall = source.lastCall;
}
const normalized = (v, locale) => String(v || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale).trim();

// Consume bounded database batches. Only summaries survive between batches;
// individual calls and turns are returned solely for explicit detail/report requests.
export function createPageData(metadata, query) {
  const q = parsePageQuery(query);
  const data = pageMetadata(metadata);
  const totals = summarize([], q.pricing);
  const groups = new Map(), models = new Set(), folders = new Set(), rows = [];
  const buckets = (q.buckets || []).map(b => ({ ...b, summary: summarize([], q.pricing) }));
  const rawSessions = [];
  let matched = 0;
  const inRange = timestamp => { const n = Date.parse(timestamp); return n >= q.start && n <= q.end; };
  return {
    query: q,
    add(session) {
      if (q.view === 'settings') return;
      for (const model of session.models || []) models.add(model);
      folders.add(session.cwd || '');
      if (q.id && session.id !== q.id) return;
      const scoped = ['conversations', 'detail', 'pricing'].includes(q.view);
      if (scoped && q.node && q.node !== 'all' && session.nodeId !== q.node) return;
      if (scoped && q.folders.length && !q.folders.includes(session.cwd || '')) return;
      const calls = (session.calls || []).filter(c => inRange(c.timestamp) && (!scoped || !q.model || q.model === 'all' || c.model === q.model));
      if (!calls.length) return;
      const turns = (session.turns || []).filter(t => inRange(t.startedAt) && (!scoped || !q.model || q.model === 'all' || t.model === q.model));
      const summary = summarize(calls, q.pricing);
      const row = { id: session.id, sourceSessionId: session.sourceSessionId, title: conversationTitle(session), nodeId: session.nodeId, nodeAlias: session.nodeAlias, cwd: session.cwd, projectName: session.projectName, projectGitHubUrl: session.projectGitHubUrl, startedAt: session.startedAt, models: [...new Set(calls.map(c => c.model))], summary, usage: summary.usage, modelCalls: calls.length, exchanges: turns.length, durationMs: turns.reduce((n, t) => n + (t.durationMs || 0), 0), calls: [], turns: [] };
      if (['detail', 'pricing'].includes(q.view)) { rawSessions.push({ ...row, calls, turns }); return; }
      const identity = projectIdentity(row, q.unknownProject || 'No project');
      if (q.view === 'conversations') {
        const profiles = summary.profiles.map(p => `${p.model} ${(q.effortLabels || {})[p.effort] || p.effort || ''} ${p.fast ? 'fast' : 'standard'}`).join(' ');
        const title = row.title === 'Conversation sans titre' ? q.untitled : row.title;
        const haystack = normalized(`${title} ${row.nodeAlias || q.localNode || ''} ${row.models.join(', ')} ${profiles} ${row.cwd || ''}`, q.locale);
        if (summary.usage.totalTokens < (Number(q.usageThreshold) || 0) || (q.search && !haystack.includes(normalized(q.search, q.locale)))) return;
        rows.push({ ...row, tableTitle: title, tableProject: identity.name });
        return;
      }
      matched++;
      mergeSummary(totals, summary);
      let group = groups.get(identity.key);
      if (!group) { group = { ...identity, paths: new Set(), sessionCount: 0, summary: summarize([], q.pricing), sessions: [], models: new Map() }; groups.set(identity.key, group); }
      group.paths.add(row.cwd || ''); group.sessionCount++; mergeSummary(group.summary, summary);
      group.sessions.push(row); group.sessions.sort((a,b) => String(b.summary.lastCall).localeCompare(String(a.summary.lastCall))); group.sessions.length = Math.min(group.sessions.length, 6);
      if (q.project === group.key) for (const model of row.models) {
        const s = summarize(calls.filter(c => c.model === model), q.pricing);
        if (!group.models.has(model)) group.models.set(model, summarize([], q.pricing));
        mergeSummary(group.models.get(model), s);
      }
      rows.push(row); rows.sort((a,b) => String(b.summary.lastCall).localeCompare(String(a.summary.lastCall))); rows.length = Math.min(rows.length, 6);
      for (let i = 0; i < buckets.length; i++) {
        const b = buckets[i], start = Date.parse(b.start), end = Date.parse(b.end);
        const selected = calls.filter(c => { const t = Date.parse(c.timestamp); return t >= start && (t < end || (b.inclusiveEnd && t === end)); });
        if (selected.length) mergeSummary(b.summary, summarize(selected, q.pricing));
      }
    },
    finish() {
      const filters = { models: [...models].sort(), folders: [...folders].sort() };
      if (['detail', 'pricing'].includes(q.view)) return { ...data, sessions: rawSessions, pageData: { view: q.view, filters } };
      if (q.view === 'conversations') {
        const value = r => ({ title: r.tableTitle, node: r.nodeAlias || q.localNode, project: r.tableProject, model: r.models.join(', ') || 'unknown', lastCall: Date.parse(r.summary.lastCall) || 0, exchanges: r.exchanges, calls: r.modelCalls, tokens: r.usage.totalTokens, duration: r.durationMs, cost: r.summary.cost.cost })[q.sortKey || 'tokens'];
        rows.sort((a,b) => { const x=value(a), y=value(b); const c=typeof x === 'string' ? x.localeCompare(String(y), q.locale, {sensitivity:'base'}) : x-y; return (c || a.id.localeCompare(b.id)) * (q.sortDirection === 'asc' ? 1 : -1); });
        const total = rows.length, page = Math.min(q.page, Math.max(1, Math.ceil(total / q.pageSize)));
        return { ...data, sessions: rows.slice((page-1)*q.pageSize, page*q.pageSize), pageData: { view: q.view, total, page, pageSize: q.pageSize, filters } };
      }
      const projects = [...groups.values()].sort((a,b) => b.summary.cost.cost - a.summary.cost.cost);
      const serializeGroup = g => ({ ...g, paths: [...g.paths], sessions: g.key === q.project ? g.sessions : [], models: [...g.models].map(([model, summary]) => ({model, summary})), cost: g.summary.cost, calls: [] });
      return { ...data, sessions: q.view === 'overview' ? rows : [], pageData: { view: q.view, totals, matched, projectCount: projects.length, projects: (q.view === 'overview' ? projects.slice(0, OVERVIEW_PROJECT_LIMIT) : projects).map(serializeGroup), buckets, filters } };
    },
  };
}
