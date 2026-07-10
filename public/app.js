const DEFAULT_PRICING = {
  reference: { input: 5, cached: 0.5, output: 30, label: "Référence (GPT-5.5)" },
  models: {
    "gpt-5.5": { input: 5, cached: 0.5, output: 30 },
    "gpt-5.5-pro": { input: 30, cached: 30, output: 180 },
    "gpt-5.4": { input: 2.5, cached: 0.25, output: 15 },
    "gpt-5.4-pro": { input: 30, cached: 30, output: 180 },
    "gpt-5.2": { input: 1.75, cached: 0.175, output: 14 },
    "gpt-5": { input: 1.25, cached: 0.125, output: 10 },
  },
};

// Keep the last analysis locally for a short time. Session files remain the source
// of truth; the refresh button always bypasses this cache.
const USAGE_CACHE_KEY = "codex-usage-data";
const USAGE_CACHE_MAX_AGE_MS = 60_000;

const I18N = {
  fr: {
    "period.today": "Aujourd’hui", "period.7d": "7 jours", "period.30d": "30 jours", "period.all": "Tout",
    "period.todayLabel": "Aujourd’hui", "period.7dLabel": "7 derniers jours", "period.30dLabel": "30 derniers jours", "period.allLabel": "Tout l’historique local",
    "action.refresh": "Actualiser", "action.pricing": "Configurer les tarifs", "hero.title": "L’essentiel de votre activité Codex.", "hero.privacy": "Données locales uniquement",
    "section.load": "CHARGE", "section.distribution": "RÉPARTITION", "section.rhythm": "RYTHME", "section.signal": "SIGNAL", "section.conversations": "CONVERSATIONS",
    "chart.tokens": "Tokens dans le temps", "chart.footprint": "Empreinte tokens", "chart.calls": "Appels modèle",
    "token.fresh": "Non cachés", "token.cache": "Cache", "token.output": "Sortie", "token.freshLong": "Entrée fraîche", "token.cacheLong": "Entrée cache",
    "insight.title": "À retenir", "table.title": "Où partent les tokens ?", "table.conversation": "Conversation", "table.model": "Modèle", "table.exchanges": "Échanges", "table.calls": "Appels", "table.duration": "Durée", "table.cost": "Coût estimé", "table.hint": "Cliquez sur une ligne pour le détail",
    "search.placeholder": "Rechercher…", "model.all": "Tous les modèles", "filter.usage": "Filtrer par consommation", "filter.usageAll": "Tous les volumes", "filter.reset": "Réinitialiser", "conversation.untitled": "Conversation sans titre", "conversation.none": "Aucune conversation pour ces filtres.",
    "kpi.cost": "Coût théorique", "kpi.prices": "tarifs API configurés", "kpi.referenceCalls": "{n} appels au tarif de référence", "kpi.tokens": "Tokens", "kpi.cacheRate": "{n} % des entrées en cache", "kpi.calls": "Appels modèle", "kpi.tokensPerCall": "{n} tokens / appel", "kpi.noCall": "aucun appel", "kpi.exchanges": "Échanges", "kpi.conversations": "{n} conversation{s}", "kpi.median": "Durée médiane", "kpi.p95": "p95 {value}", "kpi.completed": "échanges terminés",
    "calls.peak": "pic {label} · {n}", "calls.none": "aucun appel", "calls.count": "{n} appels", "calls.one": "1 appel",
    "insight.dominant": "Conversation dominante", "insight.dominantText": "{title} concentre {n} % des tokens.", "insight.cache": "Cache utile", "insight.cacheText": "{n} % des tokens d’entrée ont bénéficié du cache.", "insight.longest": "Échange le plus long", "insight.longestText": "{duration} avec {calls}.", "insight.noCompleted": "Aucun échange terminé sur la période.", "insight.quiet": "Période calme", "insight.quietText": "Aucun appel modèle trouvé sur cette période.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} sur {total}", "pagination.perPage": "Par page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Page précédente", "pagination.next": "Page suivante",
    "detail.label": "DÉTAIL CONVERSATION", "detail.unknownModel": "modèle inconnu", "detail.cost": "Coût estimé", "detail.calls": "Appels", "detail.exchanges": "Échanges", "detail.cache": "Cache input", "detail.duration": "Durée cumulée", "detail.periodExchanges": "Échanges de la période", "detail.noExchange": "Aucun échange.", "detail.cwd": "Dossier de travail", "detail.id": "Identifiant", "detail.unknown": "Non renseigné",
    "pricing.simulation": "SIMULATION", "pricing.title": "Tarifs théoriques", "pricing.copy": "Prix en dollars par million de tokens. Les modèles sans tarif public utilisent le tarif de référence. Ces montants simulent l’API standard et ne représentent pas votre abonnement Codex.", "pricing.reset": "Valeurs par défaut", "pricing.save": "Enregistrer", "pricing.model": "Modèle", "pricing.input": "Entrée", "pricing.reference": "Référence (GPT-5.5)", "pricing.saved": "Tarifs enregistrés",
    "freshness": "{n} sessions indexées · relevé {time}", "refresh.done": "Sessions actualisées", "load.error": "Impossible de lire les sessions : {error}", "load.errorToast": "Erreur de chargement",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s",
  },
  en: {
    "period.today": "Today", "period.7d": "7 days", "period.30d": "30 days", "period.all": "All",
    "period.todayLabel": "Today", "period.7dLabel": "Last 7 days", "period.30dLabel": "Last 30 days", "period.allLabel": "All local history",
    "action.refresh": "Refresh", "action.pricing": "Configure prices", "hero.title": "The essentials of your Codex activity.", "hero.privacy": "Local data only",
    "section.load": "LOAD", "section.distribution": "DISTRIBUTION", "section.rhythm": "PACE", "section.signal": "SIGNAL", "section.conversations": "CONVERSATIONS",
    "chart.tokens": "Tokens over time", "chart.footprint": "Token footprint", "chart.calls": "Model calls",
    "token.fresh": "Uncached", "token.cache": "Cache", "token.output": "Output", "token.freshLong": "Fresh input", "token.cacheLong": "Cached input",
    "insight.title": "Key takeaways", "table.title": "Where do the tokens go?", "table.conversation": "Conversation", "table.model": "Model", "table.exchanges": "Turns", "table.calls": "Calls", "table.duration": "Duration", "table.cost": "Estimated cost", "table.hint": "Click a row for details",
    "search.placeholder": "Search…", "model.all": "All models", "filter.usage": "Filter by usage", "filter.usageAll": "All usage levels", "filter.reset": "Reset", "conversation.untitled": "Untitled conversation", "conversation.none": "No conversations match these filters.",
    "kpi.cost": "Theoretical cost", "kpi.prices": "configured API prices", "kpi.referenceCalls": "{n} calls use reference pricing", "kpi.tokens": "Tokens", "kpi.cacheRate": "{n}% of input was cached", "kpi.calls": "Model calls", "kpi.tokensPerCall": "{n} tokens / call", "kpi.noCall": "no calls", "kpi.exchanges": "Turns", "kpi.conversations": "{n} conversation{s}", "kpi.median": "Median duration", "kpi.p95": "p95 {value}", "kpi.completed": "completed turns",
    "calls.peak": "peak {label} · {n}", "calls.none": "no calls", "calls.count": "{n} calls", "calls.one": "1 call",
    "insight.dominant": "Dominant conversation", "insight.dominantText": "{title} accounts for {n}% of tokens.", "insight.cache": "Effective cache", "insight.cacheText": "{n}% of input tokens were served from cache.", "insight.longest": "Longest turn", "insight.longestText": "{duration} with {calls}.", "insight.noCompleted": "No completed turns in this period.", "insight.quiet": "Quiet period", "insight.quietText": "No model calls found in this period.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} of {total}", "pagination.perPage": "Per page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Previous page", "pagination.next": "Next page",
    "detail.label": "CONVERSATION DETAILS", "detail.unknownModel": "unknown model", "detail.cost": "Estimated cost", "detail.calls": "Calls", "detail.exchanges": "Turns", "detail.cache": "Input cache", "detail.duration": "Total duration", "detail.periodExchanges": "Turns in this period", "detail.noExchange": "No turns.", "detail.cwd": "Working directory", "detail.id": "Identifier", "detail.unknown": "Not available",
    "pricing.simulation": "SIMULATION", "pricing.title": "Theoretical prices", "pricing.copy": "Prices in US dollars per million tokens. Models without public pricing use the reference rate. These amounts simulate the standard API and do not represent your Codex subscription.", "pricing.reset": "Reset defaults", "pricing.save": "Save", "pricing.model": "Model", "pricing.input": "Input", "pricing.reference": "Reference (GPT-5.5)", "pricing.saved": "Prices saved",
    "freshness": "{n} sessions indexed · updated {time}", "refresh.done": "Sessions refreshed", "load.error": "Unable to read sessions: {error}", "load.errorToast": "Loading error",
    "duration.seconds": "{n}s", "duration.minutes": "{m}m {s}s",
  },
  de: {
    "period.today": "Heute", "period.7d": "7 Tage", "period.30d": "30 Tage", "period.all": "Alle",
    "period.todayLabel": "Heute", "period.7dLabel": "Letzte 7 Tage", "period.30dLabel": "Letzte 30 Tage", "period.allLabel": "Gesamter lokaler Verlauf",
    "action.refresh": "Aktualisieren", "action.pricing": "Preise konfigurieren", "hero.title": "Das Wesentliche Ihrer Codex-Aktivität.", "hero.privacy": "Nur lokale Daten",
    "section.load": "AUSLASTUNG", "section.distribution": "VERTEILUNG", "section.rhythm": "RHYTHMUS", "section.signal": "SIGNAL", "section.conversations": "KONVERSATIONEN",
    "chart.tokens": "Tokens im Zeitverlauf", "chart.footprint": "Token-Verteilung", "chart.calls": "Modellaufrufe",
    "token.fresh": "Nicht gecacht", "token.cache": "Cache", "token.output": "Ausgabe", "token.freshLong": "Frische Eingabe", "token.cacheLong": "Gecachte Eingabe",
    "insight.title": "Das Wichtigste", "table.title": "Wohin gehen die Tokens?", "table.conversation": "Konversation", "table.model": "Modell", "table.exchanges": "Runden", "table.calls": "Aufrufe", "table.duration": "Dauer", "table.cost": "Geschätzte Kosten", "table.hint": "Zeile anklicken für Details",
    "search.placeholder": "Suchen…", "model.all": "Alle Modelle", "filter.usage": "Nach Nutzung filtern", "filter.usageAll": "Alle Nutzungsstufen", "filter.reset": "Zurücksetzen", "conversation.untitled": "Unbenannte Konversation", "conversation.none": "Keine Konversationen für diese Filter.",
    "kpi.cost": "Theoretische Kosten", "kpi.prices": "konfigurierte API-Preise", "kpi.referenceCalls": "{n} Aufrufe zum Referenzpreis", "kpi.tokens": "Tokens", "kpi.cacheRate": "{n} % der Eingabe aus Cache", "kpi.calls": "Modellaufrufe", "kpi.tokensPerCall": "{n} Tokens / Aufruf", "kpi.noCall": "keine Aufrufe", "kpi.exchanges": "Runden", "kpi.conversations": "{n} Konversation{s}", "kpi.median": "Median-Dauer", "kpi.p95": "p95 {value}", "kpi.completed": "abgeschlossene Runden",
    "calls.peak": "Spitze {label} · {n}", "calls.none": "keine Aufrufe", "calls.count": "{n} Aufrufe", "calls.one": "1 Aufruf",
    "insight.dominant": "Dominante Konversation", "insight.dominantText": "{title} verursacht {n} % der Tokens.", "insight.cache": "Effektiver Cache", "insight.cacheText": "{n} % der Eingabe-Tokens kamen aus dem Cache.", "insight.longest": "Längste Runde", "insight.longestText": "{duration} mit {calls}.", "insight.noCompleted": "Keine abgeschlossene Runde in diesem Zeitraum.", "insight.quiet": "Ruhiger Zeitraum", "insight.quietText": "Keine Modellaufrufe in diesem Zeitraum.",
    "table.count": "{n} Konversation{s}", "table.range": "{start}–{end} von {total}", "pagination.perPage": "Pro Seite", "pagination.page": "Seite {page} / {pages}", "pagination.previous": "Vorherige Seite", "pagination.next": "Nächste Seite",
    "detail.label": "KONVERSATIONSDETAILS", "detail.unknownModel": "unbekanntes Modell", "detail.cost": "Geschätzte Kosten", "detail.calls": "Aufrufe", "detail.exchanges": "Runden", "detail.cache": "Eingabe-Cache", "detail.duration": "Gesamtdauer", "detail.periodExchanges": "Runden im Zeitraum", "detail.noExchange": "Keine Runden.", "detail.cwd": "Arbeitsverzeichnis", "detail.id": "Kennung", "detail.unknown": "Nicht verfügbar",
    "pricing.simulation": "SIMULATION", "pricing.title": "Theoretische Preise", "pricing.copy": "Preise in US-Dollar pro Million Tokens. Modelle ohne öffentlichen Preis verwenden den Referenztarif. Diese Beträge simulieren die Standard-API und entsprechen nicht Ihrem Codex-Abonnement.", "pricing.reset": "Standardwerte", "pricing.save": "Speichern", "pricing.model": "Modell", "pricing.input": "Eingabe", "pricing.reference": "Referenz (GPT-5.5)", "pricing.saved": "Preise gespeichert",
    "freshness": "{n} Sitzungen indexiert · Stand {time}", "refresh.done": "Sitzungen aktualisiert", "load.error": "Sitzungen konnten nicht gelesen werden: {error}", "load.errorToast": "Ladefehler",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s",
  },
};

const state = {
  data: null,
  period: "today",
  query: "",
  model: "all",
  usageThreshold: 0,
  page: 1,
  pageSize: 25,
  sortKey: "tokens",
  sortDirection: "desc",
  language: localStorage.getItem("codex-usage-language") || "fr",
  pricing: loadPricing(),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const locale = () => ({ fr: "fr-FR", en: "en-US", de: "de-DE" })[state.language];
const t = (key, values = {}) => (I18N[state.language]?.[key] || I18N.fr[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
const formatInt = (value) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value);
const formatCompact = (value) => new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 1 }).format(value);
const formatDate = (value) => new Intl.DateTimeFormat(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);

function loadPricing() {
  try { return JSON.parse(localStorage.getItem("codex-usage-pricing")) || structuredClone(DEFAULT_PRICING); }
  catch { return structuredClone(DEFAULT_PRICING); }
}

function loadUsageCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(USAGE_CACHE_KEY));
    if (!cached?.data?.sessions || !Number.isFinite(cached.savedAt)) return null;
    if (Date.now() - cached.savedAt > USAGE_CACHE_MAX_AGE_MS) return null;
    return cached.data;
  } catch { return null; }
}

function saveUsageCache(data) {
  try { localStorage.setItem(USAGE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); }
  catch { /* The dashboard still works when browser storage is unavailable or full. */ }
}

function dateRange() {
  const end = new Date();
  if (state.period === "all") return { start: new Date(0), end };
  if (state.period === "today") {
    const start = new Date(); start.setHours(0, 0, 0, 0); return { start, end };
  }
  const days = state.period === "7d" ? 7 : 30;
  const start = new Date(); start.setDate(start.getDate() - days + 1); start.setHours(0, 0, 0, 0);
  return { start, end };
}

function inRange(timestamp) {
  const time = Date.parse(timestamp);
  const { start, end } = dateRange();
  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}

function zeroUsage() { return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }; }
function sumUsage(items) { return items.reduce((sum, item) => { for (const key of Object.keys(sum)) sum[key] += item.usage?.[key] || 0; return sum; }, zeroUsage()); }

function priceFor(model) {
  if (state.pricing.models[model]) return { ...state.pricing.models[model], exact: true };
  const key = Object.keys(state.pricing.models).sort((a, b) => b.length - a.length).find((name) => model === name || model.startsWith(`${name}-`));
  return key ? { ...state.pricing.models[key], exact: true } : { ...state.pricing.reference, exact: false };
}

function costOfCalls(calls) {
  let cost = 0; let estimatedCalls = 0;
  for (const call of calls) {
    const price = priceFor(call.model || "unknown");
    const usage = call.usage || zeroUsage();
    const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    cost += (fresh * price.input + usage.cachedInputTokens * price.cached + usage.outputTokens * price.output) / 1_000_000;
    if (!price.exact) estimatedCalls += 1;
  }
  return { cost, estimatedCalls };
}

function formatCost(value) {
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatDuration(ms) {
  if (!ms) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t("duration.seconds", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  return t("duration.minutes", { m: minutes, s: seconds % 60 });
}

function pluralSuffix(count) { return count === 1 ? "" : state.language === "de" ? "en" : "s"; }
function sessionTitle(session) { return session.title === "Conversation sans titre" ? t("conversation.untitled") : session.title; }

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * ratio))];
}

function scopedSessions() {
  if (!state.data) return [];
  return state.data.sessions.map((session) => {
    const calls = session.calls.filter((call) => inRange(call.timestamp) && (state.model === "all" || call.model === state.model));
    const turns = session.turns.filter((turn) => inRange(turn.startedAt) && (state.model === "all" || turn.model === state.model));
    return { ...session, calls, turns, usage: sumUsage(calls), modelCalls: calls.length, exchanges: turns.length, durationMs: turns.reduce((sum, turn) => sum + (turn.durationMs || 0), 0) };
  // Ignore heartbeat/maintenance sessions that complete without a model call;
  // they otherwise swamp the conversation view with zero-token rows.
  }).filter((session) => session.calls.length);
}

function allScopedCalls(sessions = scopedSessions()) { return sessions.flatMap((session) => session.calls); }

function render() {
  const sessions = scopedSessions();
  const calls = allScopedCalls(sessions);
  const turns = sessions.flatMap((session) => session.turns);
  const usage = sumUsage(calls);
  renderKpis(sessions, calls, turns, usage);
  renderTokenChart(calls);
  renderTokenMix(usage);
  renderCallChart(calls);
  renderInsights(sessions, calls, turns, usage);
  renderTable(sessions);
  renderFreshness();
}

function renderKpis(sessions, calls, turns, usage) {
  const cost = costOfCalls(calls);
  const durations = turns.map((turn) => turn.durationMs).filter(Boolean);
  const cacheRate = usage.inputTokens ? usage.cachedInputTokens / usage.inputTokens : 0;
  const cards = [
    [t("kpi.cost"), formatCost(cost.cost), cost.estimatedCalls ? t("kpi.referenceCalls", { n: cost.estimatedCalls }) : t("kpi.prices"), "$"],
    [t("kpi.tokens"), formatCompact(usage.totalTokens), t("kpi.cacheRate", { n: Math.round(cacheRate * 100) }), "◫"],
    [t("kpi.calls"), formatInt(calls.length), calls.length ? t("kpi.tokensPerCall", { n: formatCompact(usage.totalTokens / calls.length) }) : t("kpi.noCall"), "↗"],
    [t("kpi.exchanges"), formatInt(turns.length), t("kpi.conversations", { n: sessions.length, s: pluralSuffix(sessions.length) }), "↔"],
    [t("kpi.median"), formatDuration(percentile(durations, .5)), durations.length ? t("kpi.p95", { value: formatDuration(percentile(durations, .95)) }) : t("kpi.completed"), "◷"],
  ];
  $("#kpis").innerHTML = cards.map(([label, value, meta, icon]) => `<article class="kpi"><span class="kpi-label">${label}<b class="kpi-icon">${icon}</b></span><strong class="kpi-value">${value}</strong><span class="kpi-meta">${meta}</span></article>`).join("");
}

function bucketsFor(calls) {
  const byHour = state.period === "today";
  const byMonth = state.period === "all";
  const count = byHour ? 24 : state.period === "7d" ? 7 : state.period === "30d" ? 30 : 12;
  const buckets = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now);
    if (byHour) { start.setHours(now.getHours() - i, 0, 0, 0); }
    else if (byMonth) { start.setMonth(now.getMonth() - i, 1); start.setHours(0, 0, 0, 0); }
    else { start.setDate(now.getDate() - i); start.setHours(0, 0, 0, 0); }
    const end = new Date(start);
    if (byHour) end.setHours(end.getHours() + 1); else if (byMonth) end.setMonth(end.getMonth() + 1); else end.setDate(end.getDate() + 1);
    buckets.push({ start, end, label: byHour ? `${String(start.getHours()).padStart(2, "0")}h` : byMonth ? start.toLocaleDateString(locale(), { month: "short" }) : start.toLocaleDateString(locale(), { day: "2-digit", month: count > 7 ? "2-digit" : "short" }), calls: [] });
  }
  for (const call of calls) {
    const time = Date.parse(call.timestamp); const bucket = buckets.find((item) => time >= item.start && time < item.end); if (bucket) bucket.calls.push(call);
  }
  return buckets;
}

function renderTokenChart(calls) {
  const buckets = bucketsFor(calls).map((bucket) => ({ ...bucket, usage: sumUsage(bucket.calls) }));
  const max = Math.max(1, ...buckets.map((bucket) => bucket.usage.totalTokens));
  $("#tokenChart").innerHTML = buckets.map((bucket, index) => {
    const usage = bucket.usage; const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
    const freshHeight = fresh / max * 205; const cachedHeight = usage.cachedInputTokens / max * 205; const outputHeight = usage.outputTokens / max * 205;
    const showLabel = buckets.length <= 12 || index % Math.ceil(buckets.length / 8) === 0;
    return `<div class="chart-column" data-tip="${bucket.label} · ${formatCompact(usage.totalTokens)} tokens"><div class="chart-stack"><i class="chart-segment" style="height:${freshHeight}px;background:var(--lime)"></i><i class="chart-segment" style="height:${cachedHeight}px;background:var(--lime-2)"></i><i class="chart-segment" style="height:${outputHeight}px;background:var(--orange)"></i></div><label>${showLabel ? bucket.label : ""}</label></div>`;
  }).join("");
}

function renderTokenMix(usage) {
  const total = Math.max(1, usage.totalTokens); const fresh = Math.max(0, usage.inputTokens - usage.cachedInputTokens);
  const values = [{ name: t("token.freshLong"), value: fresh, color: "var(--lime)" }, { name: t("token.cacheLong"), value: usage.cachedInputTokens, color: "var(--lime-2)" }, { name: t("token.output"), value: usage.outputTokens, color: "var(--orange)" }];
  let cursor = 0; const stops = values.map((item) => { const start = cursor; cursor += item.value / total * 100; return `${item.color} ${start}% ${cursor}%`; }).join(",");
  $("#tokenMix").innerHTML = `<div class="donut-wrap"><div class="donut" style="background:conic-gradient(${stops || "#252a27 0 100%"})"></div><div class="mix-list">${values.map((item) => `<div class="mix-item"><i style="background:${item.color}"></i><div><span>${item.name}</span><strong>${formatCompact(item.value)} · ${Math.round(item.value / total * 100)} %</strong></div></div>`).join("")}</div></div>`;
}

function renderCallChart(calls) {
  const buckets = bucketsFor(calls); const max = Math.max(1, ...buckets.map((bucket) => bucket.calls.length));
  const peak = buckets.reduce((best, bucket) => bucket.calls.length > best.calls.length ? bucket : best, buckets[0] || { calls: [], label: "—" });
  $("#peakLabel").textContent = peak.calls.length ? t("calls.peak", { label: peak.label, n: peak.calls.length }) : t("calls.none");
  $("#callChart").innerHTML = buckets.map((bucket, index) => `<div class="call-bar-wrap" title="${bucket.label} · ${bucket.calls.length === 1 ? t("calls.one") : t("calls.count", { n: bucket.calls.length })}"><div class="call-bar" style="height:${bucket.calls.length / max * 112}px"></div><span>${buckets.length <= 12 || index % Math.ceil(buckets.length / 8) === 0 ? bucket.label : ""}</span></div>`).join("");
}

function renderInsights(sessions, calls, turns, usage) {
  const top = [...sessions].sort((a, b) => b.usage.totalTokens - a.usage.totalTokens)[0];
  const cacheRate = usage.inputTokens ? Math.round(usage.cachedInputTokens / usage.inputTokens * 100) : 0;
  const long = [...turns].filter((turn) => turn.durationMs).sort((a, b) => b.durationMs - a.durationMs)[0];
  const items = calls.length ? [
    ["↑", t("insight.dominant"), top ? t("insight.dominantText", { title: sessionTitle(top), n: Math.round(top.usage.totalTokens / Math.max(1, usage.totalTokens) * 100) }) : "—"],
    ["◫", t("insight.cache"), t("insight.cacheText", { n: cacheRate })],
    ["◷", t("insight.longest"), long ? t("insight.longestText", { duration: formatDuration(long.durationMs), calls: long.calls === 1 ? t("calls.one") : t("calls.count", { n: long.calls }) }) : t("insight.noCompleted")],
  ] : [["·", t("insight.quiet"), t("insight.quietText")]];
  $("#insights").innerHTML = items.map(([icon, title, text]) => `<div class="insight"><div class="insight-icon">${icon}</div><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(text)}</span></div></div>`).join("");
}

function renderTable(sessions) {
  const query = normalizeSearch(state.query);
  const prepared = sessions.map((session) => ({
    ...session,
    tableModel: [...new Set(session.calls.map((call) => call.model))].join(", ") || session.models.join(", ") || "unknown",
    tableCost: costOfCalls(session.calls),
  }));
  const filtered = prepared.filter((session) => {
    const haystack = normalizeSearch(`${sessionTitle(session)} ${session.tableModel} ${session.cwd || ""}`);
    return session.usage.totalTokens >= state.usageThreshold && (!query || haystack.includes(query));
  });
  filtered.sort((left, right) => compareSessions(left, right) * (state.sortDirection === "asc" ? 1 : -1));

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIndex = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(startIndex, startIndex + state.pageSize);
  $("#conversationRows").innerHTML = visible.length ? visible.map((session) => {
    return `<tr data-session-id="${escapeHtml(session.id)}"><td><div class="conversation-name">${escapeHtml(sessionTitle(session))}</div><div class="conversation-date">${formatDate(new Date(session.updatedAt))}</div></td><td><span class="model-pill">${escapeHtml(session.tableModel)}</span></td><td>${session.exchanges}</td><td>${session.modelCalls}</td><td>${formatCompact(session.usage.totalTokens)}</td><td>${formatDuration(session.durationMs)}</td><td class="cost">${formatCost(session.tableCost.cost)}${session.tableCost.estimatedCalls ? " ≈" : ""}</td></tr>`;
  }).join("") : `<tr><td colspan="7" class="empty">${t("conversation.none")}</td></tr>`;
  const rangeStart = filtered.length ? startIndex + 1 : 0;
  const rangeEnd = Math.min(startIndex + visible.length, filtered.length);
  $("#tableCount").textContent = t("table.range", { start: rangeStart, end: rangeEnd, total: filtered.length });
  $("#pageIndicator").textContent = t("pagination.page", { page: state.page, pages: totalPages });
  $("#previousPage").disabled = state.page <= 1;
  $("#nextPage").disabled = state.page >= totalPages;
  $$(".sort-button").forEach((button) => {
    const active = button.dataset.sort === state.sortKey;
    button.classList.toggle("active", active);
    button.dataset.direction = active ? state.sortDirection : "";
    button.closest("th").setAttribute("aria-sort", active ? (state.sortDirection === "asc" ? "ascending" : "descending") : "none");
  });
  $$("#conversationRows tr[data-session-id]").forEach((row) => row.addEventListener("click", () => openDrawer(row.dataset.sessionId)));
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale()).trim();
}

function compareSessions(left, right) {
  const values = {
    title: [sessionTitle(left), sessionTitle(right)],
    model: [left.tableModel, right.tableModel],
    exchanges: [left.exchanges, right.exchanges],
    calls: [left.modelCalls, right.modelCalls],
    tokens: [left.usage.totalTokens, right.usage.totalTokens],
    duration: [left.durationMs, right.durationMs],
    cost: [left.tableCost.cost, right.tableCost.cost],
  }[state.sortKey] || [left.usage.totalTokens, right.usage.totalTokens];
  if (typeof values[0] === "string") return values[0].localeCompare(values[1], locale(), { sensitivity: "base" });
  return values[0] - values[1];
}

function openDrawer(id) {
  const session = scopedSessions().find((item) => item.id === id); if (!session) return;
  const cost = costOfCalls(session.calls); const usage = session.usage;
  $("#drawerContent").innerHTML = `<p class="eyebrow">${t("detail.label")}</p><h2 id="drawerTitle" class="drawer-title">${escapeHtml(sessionTitle(session))}</h2><p class="drawer-subtitle">${formatDate(new Date(session.startedAt))} · ${escapeHtml(session.models.join(", ") || t("detail.unknownModel"))}</p><div class="detail-kpis"><div class="detail-kpi"><span>${t("detail.cost")}</span><strong class="cost">${formatCost(cost.cost)}</strong></div><div class="detail-kpi"><span>Tokens</span><strong>${formatCompact(usage.totalTokens)}</strong></div><div class="detail-kpi"><span>${t("detail.calls")}</span><strong>${session.modelCalls}</strong></div><div class="detail-kpi"><span>${t("detail.exchanges")}</span><strong>${session.exchanges}</strong></div><div class="detail-kpi"><span>${t("detail.cache")}</span><strong>${usage.inputTokens ? Math.round(usage.cachedInputTokens / usage.inputTokens * 100) : 0} %</strong></div><div class="detail-kpi"><span>${t("detail.duration")}</span><strong>${formatDuration(session.durationMs)}</strong></div></div><div class="detail-section"><h3>${t("detail.periodExchanges")}</h3>${session.turns.map((turn, index) => `<div class="turn-row"><strong>#${index + 1} · ${escapeHtml(turn.model)}</strong><span>${turn.calls === 1 ? t("calls.one") : t("calls.count", { n: turn.calls })}</span><span>${formatDuration(turn.durationMs)}</span></div>`).join("") || `<p class="drawer-subtitle">${t("detail.noExchange")}</p>`}</div><div class="detail-section"><h3>${t("detail.cwd")}</h3><div class="path-box">${escapeHtml(session.cwd || t("detail.unknown"))}</div></div><div class="detail-section"><h3>${t("detail.id")}</h3><div class="path-box">${escapeHtml(session.id)}</div></div>`;
  $("#detailDrawer").setAttribute("aria-hidden", "false"); document.body.style.overflow = "hidden";
}

function renderFreshness() {
  $("#periodLabel").textContent = t(`period.${state.period}Label`).toUpperCase();
  const time = new Date(state.data.generatedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#freshness").textContent = t("freshness", { n: state.data.sessions.length, time });
}

function populateModels() {
  const models = [...new Set(state.data.sessions.flatMap((session) => session.models))].sort();
  $("#modelFilter").innerHTML = `<option value="all">${t("model.all")}</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  $("#modelFilter").value = state.model;
}

function openPricing() {
  const models = [...new Set(state.data.sessions.flatMap((session) => session.models))].sort();
  const rows = [{ key: "reference", label: t("pricing.reference"), values: state.pricing.reference }, ...models.map((model) => ({ key: model, label: model, values: priceFor(model) }))];
  $("#pricingRows").innerHTML = `<div class="pricing-row pricing-labels"><span>${t("pricing.model")}</span><span>${t("pricing.input")}</span><span>${t("token.cache")}</span><span>${t("token.output")}</span></div>${rows.map((row) => `<div class="pricing-row" data-price-key="${escapeHtml(row.key)}"><label title="${escapeHtml(row.label)}">${escapeHtml(row.label)}${row.key !== "reference" && !state.pricing.models[row.key] ? " ≈" : ""}</label><input type="number" min="0" step="0.001" value="${row.values.input}"><input type="number" min="0" step="0.001" value="${row.values.cached}"><input type="number" min="0" step="0.001" value="${row.values.output}"></div>`).join("")}`;
  $("#pricingDialog").showModal();
}

function savePricing() {
  const pricing = structuredClone(state.pricing);
  $$(".pricing-row[data-price-key]").forEach((row) => {
    const [input, cached, output] = [...row.querySelectorAll("input")].map((field) => Math.max(0, Number(field.value) || 0));
    if (row.dataset.priceKey === "reference") pricing.reference = { ...pricing.reference, input, cached, output };
    else pricing.models[row.dataset.priceKey] = { input, cached, output };
  });
  state.pricing = pricing; localStorage.setItem("codex-usage-pricing", JSON.stringify(pricing)); render(); toast(t("pricing.saved"));
}

async function loadData(force = false) {
  const cachedData = !force && loadUsageCache();
  if (cachedData) {
    state.data = cachedData;
    populateModels();
    render();
    return;
  }
  $("#refreshButton").classList.add("loading");
  try {
    const response = await fetch(`/api/usage${force ? "?refresh=1" : ""}`); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    state.data = await response.json(); saveUsageCache(state.data); populateModels(); render(); if (force) toast(t("refresh.done"));
  } catch (error) { $("#freshness").textContent = t("load.error", { error: error.message }); toast(t("load.errorToast")); }
  finally { $("#refreshButton").classList.remove("loading"); }
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function toast(message) { const element = $("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 1800); }

function applyTranslations() {
  document.documentElement.lang = state.language;
  $("#languageSelect").value = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria]').forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria)); });
  $("#pricingButton").title = t("action.pricing");
  $("#pricingButton").setAttribute("aria-label", t("action.pricing"));
  $("#modelFilter").setAttribute("aria-label", t("table.model"));
  $("#usageFilter").setAttribute("aria-label", t("filter.usage"));
  $("#searchInput").setAttribute("aria-label", t("search.placeholder"));
}

$$('[data-period]').forEach((button) => button.addEventListener("click", () => { $$('[data-period]').forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.period = button.dataset.period; state.page = 1; render(); }));
$("#modelFilter").addEventListener("change", (event) => { state.model = event.target.value; state.page = 1; render(); });
$("#usageFilter").addEventListener("change", (event) => { state.usageThreshold = Number(event.target.value); state.page = 1; renderTable(scopedSessions()); });
$("#searchInput").addEventListener("input", (event) => { state.query = event.target.value; state.page = 1; renderTable(scopedSessions()); });
$("#pageSizeSelect").addEventListener("change", (event) => { state.pageSize = Number(event.target.value); state.page = 1; renderTable(scopedSessions()); });
$("#previousPage").addEventListener("click", () => { state.page -= 1; renderTable(scopedSessions()); });
$("#nextPage").addEventListener("click", () => { state.page += 1; renderTable(scopedSessions()); });
$$(".sort-button").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.sort;
  if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  else { state.sortKey = key; state.sortDirection = ["title", "model"].includes(key) ? "asc" : "desc"; }
  state.page = 1;
  renderTable(scopedSessions());
}));
$("#resetTableFilters").addEventListener("click", () => {
  state.query = "";
  state.model = "all";
  state.usageThreshold = 0;
  state.sortKey = "tokens";
  state.sortDirection = "desc";
  state.page = 1;
  $("#searchInput").value = "";
  $("#modelFilter").value = "all";
  $("#usageFilter").value = "0";
  render();
});
$("#languageSelect").addEventListener("change", (event) => {
  state.language = event.target.value;
  localStorage.setItem("codex-usage-language", state.language);
  applyTranslations();
  if (state.data) { populateModels(); render(); }
});
$("#refreshButton").addEventListener("click", () => loadData(true));
$("#pricingButton").addEventListener("click", openPricing);
$("#savePricing").addEventListener("click", savePricing);
$("#resetPricing").addEventListener("click", () => { state.pricing = structuredClone(DEFAULT_PRICING); localStorage.setItem("codex-usage-pricing", JSON.stringify(state.pricing)); $("#pricingDialog").close(); openPricing(); render(); });
$$('[data-close-drawer]').forEach((element) => element.addEventListener("click", () => { $("#detailDrawer").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; }));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { $("#detailDrawer").setAttribute("aria-hidden", "true"); document.body.style.overflow = ""; } });

applyTranslations();
loadData();
