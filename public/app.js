import { codexCreditsOfCalls, fastMultiplierFor, usageProfilesOfCalls } from "./usage-pricing.js";
import { DEFAULT_API_PRICING, apiCostOfCalls, apiPriceFor, mergeApiPricing } from "./api-pricing.js";
import { ADDITIONAL_I18N, LOCALE_TAGS, resolveLanguage } from "./translations.js";
import { percentageOf, stackedChartSegments } from "./visualization.js";

// Paint the last browser snapshot immediately, then replace it from the server's
// background-refreshed snapshot. Session files remain the source of truth.
const USAGE_CACHE_KEY = "codex-usage-data";
const USAGE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const POLL_INTERVAL_MS = 15_000;

const I18N = {
  fr: {
    "app.title": "Local Usage — Coûts et activité", "brand.tagline": "pour Codex · local", "license.independent": "Projet libre et indépendant pour les données locales Codex.", "license.source": "Code source", "nav.period": "Période", "action.language": "Langue", "action.close": "Fermer", "summary.label": "Synthèse de la période", "summary.kpis": "Indicateurs principaux",
    "period.today": "Aujourd’hui", "period.7d": "7 jours", "period.30d": "30 jours", "period.all": "Tout",
    "period.todayLabel": "Aujourd’hui", "period.7dLabel": "7 derniers jours", "period.30dLabel": "30 derniers jours", "period.allLabel": "Tout l’historique local",
    "action.refresh": "Actualiser", "action.pricing": "Configurer les tarifs", "hero.title": "Coûts et activité", "hero.privacy": "Données locales uniquement",
    "section.load": "ACTIVITÉ", "section.distribution": "RÉPARTITION", "section.rhythm": "RYTHME", "section.signal": "SIGNAL", "section.conversations": "DÉTAIL",
    "chart.tokens": "Tokens dans le temps", "chart.footprint": "Empreinte tokens", "chart.calls": "Appels modèle",
    "token.fresh": "Non cachés", "token.cache": "Cache", "token.output": "Sortie", "token.freshLong": "Entrée fraîche", "token.cacheLong": "Entrée cache",
    "insight.title": "À retenir", "table.title": "Conversations", "table.conversation": "Conversation", "table.project": "Projet", "table.model": "Configuration", "table.exchange": "échange", "table.exchanges": "Échanges", "table.calls": "Appels", "table.duration": "Durée", "table.cost": "Coût API", "table.hint": "Cliquez sur une ligne pour le détail",
    "search.placeholder": "Rechercher…", "search.aria": "Rechercher une conversation", "model.all": "Tous les modèles", "filter.model": "Filtrer par modèle", "filter.folderAll": "Tous les dossiers", "filter.folderSelected": "Dossiers sélectionnés : {n}", "filter.folder": "Filtrer par projet ou dossier", "filter.usage": "Filtrer par consommation", "filter.usageAll": "Tous les volumes", "filter.usage100k": "≥ 100k tokens", "filter.usage1m": "≥ 1M tokens", "filter.usage10m": "≥ 10M tokens", "filter.reset": "Réinitialiser", "conversation.untitled": "Conversation sans titre", "conversation.none": "Aucune conversation pour ces filtres.",
    "kpi.credits": "Crédits Codex", "kpi.officialRates": "tarifs officiels par token", "kpi.fastPremium": "Prime Fast", "kpi.fastCalls": "{n} appels Fast détectés", "kpi.fastUsage": "{n} appels Fast · prime {premium}", "kpi.standardUsage": "tarification Codex Standard", "kpi.unrated": "{n} appels non tarifés", "kpi.cost": "Équivalent API", "kpi.prices": "tarifs API configurés", "kpi.referenceCalls": "{n} appels au tarif de référence", "kpi.tokens": "Tokens traités", "kpi.cacheRate": "{n} % des entrées en cache", "kpi.calls": "Appels modèle", "kpi.tokensPerCall": "{n} tokens / appel", "kpi.noCall": "aucun appel", "kpi.exchanges": "Échanges", "kpi.conversations": "Conversations : {n}", "kpi.projects": "Projets actifs", "kpi.median": "Durée médiane", "kpi.p95": "p95 {value}", "kpi.completed": "échanges terminés",
    "cost.estimate": "ESTIMATION API", "cost.officialCoverage": "{n} % des appels tarifés", "cost.referenceCoverage": "{n} appels au tarif de référence", "cost.longContext": "{n} appels > 272 k · majoration incluse", "cost.standardContext": "Aucun appel > 272 k tokens", "cost.disclaimer": "Hors frais d’outils et écritures de cache", "cost.fresh": "Entrée fraîche", "cost.cached": "Entrée cache", "cost.output": "Sortie", "cost.config": "Ajuster les tarifs",
    "projects.label": "PROJETS", "projects.title": "Coût par projet", "projects.hint": "Cliquez sur un projet pour filtrer", "projects.none": "Aucun projet sur cette période", "projects.unknown": "Sans projet", "projects.filter": "Filtrer sur {name}", "chart.cost": "Coût API dans le temps", "chart.costHint": "Ventilé par type de token",
    "calls.peak": "pic {label} · {n}", "calls.none": "aucun appel", "calls.count": "{n} appels", "calls.one": "1 appel",
    "insight.dominant": "Conversation dominante", "insight.dominantText": "{title} concentre {n} % des tokens.", "insight.cache": "Cache utile", "insight.cacheText": "{n} % des tokens d’entrée ont bénéficié du cache.", "insight.fast": "Prime Fast", "insight.fastText": "{n} appels Fast ajoutent {premium} au tarif Standard.", "insight.longest": "Échange le plus long", "insight.longestText": "{duration} avec {calls}.", "insight.noCompleted": "Aucun échange terminé sur la période.", "insight.quiet": "Période calme", "insight.quietText": "Aucun appel modèle trouvé sur cette période.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} sur {total}", "table.tokens": "Tokens", "pagination.label": "Pagination", "pagination.perPage": "Par page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Page précédente", "pagination.next": "Page suivante",
    "detail.label": "DÉTAIL CONVERSATION", "detail.unknownModel": "modèle inconnu", "detail.configuration": "Configuration détectée", "detail.credits": "Crédits Codex", "detail.cost": "Coût API théorique", "detail.calls": "Appels", "detail.exchanges": "Échanges", "detail.cache": "Cache input", "detail.duration": "Durée cumulée", "detail.periodExchanges": "Échanges de la période", "detail.noExchange": "Aucun échange.", "detail.cwd": "Dossier de travail", "detail.id": "Identifiant", "detail.unknown": "Non renseigné", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Low", "effort.medium": "Medium", "effort.high": "High", "effort.xhigh": "Extra-high", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Effort inconnu", "profile.more": "Autres : {n}",
    "pricing.simulation": "ESTIMATION", "pricing.title": "Tarifs API", "pricing.copy": "Prix en dollars par million de tokens. Les tarifs GPT-5.6 officiels et les majorations long contexte sont appliqués. Les frais d’outils et d’écriture de cache ne sont pas observables dans les sessions locales.", "pricing.reset": "Valeurs officielles", "pricing.save": "Enregistrer", "pricing.model": "Modèle", "pricing.input": "Entrée", "pricing.reference": "Référence (GPT-5.6 Sol)", "pricing.modelType": "modèle", "pricing.effortType": "raisonnement : {effort}", "pricing.saved": "Tarifs enregistrés",
    "freshness": "{n} sessions indexées · relevé {time}", "refresh.done": "Sessions actualisées", "load.loading": "Chargement des sessions locales…", "load.error": "Impossible de lire les sessions : {error}", "load.errorToast": "Erreur de chargement", "units.tokens": "tokens",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s",
  },
  en: {
    "app.title": "Local Usage — Costs and activity", "brand.tagline": "for Codex · local", "license.independent": "Independent free software for local Codex data.", "license.source": "Source code", "nav.period": "Period", "action.language": "Language", "action.close": "Close", "summary.label": "Period summary", "summary.kpis": "Key indicators",
    "period.today": "Today", "period.7d": "7 days", "period.30d": "30 days", "period.all": "All",
    "period.todayLabel": "Today", "period.7dLabel": "Last 7 days", "period.30dLabel": "Last 30 days", "period.allLabel": "All local history",
    "action.refresh": "Refresh", "action.pricing": "Configure prices", "hero.title": "Costs and activity", "hero.privacy": "Local data only",
    "section.load": "ACTIVITY", "section.distribution": "DISTRIBUTION", "section.rhythm": "PACE", "section.signal": "SIGNAL", "section.conversations": "DETAIL",
    "chart.tokens": "Tokens over time", "chart.footprint": "Token footprint", "chart.calls": "Model calls",
    "token.fresh": "Uncached", "token.cache": "Cache", "token.output": "Output", "token.freshLong": "Fresh input", "token.cacheLong": "Cached input",
    "insight.title": "Key takeaways", "table.title": "Conversations", "table.conversation": "Conversation", "table.project": "Project", "table.model": "Configuration", "table.exchange": "turn", "table.exchanges": "Turns", "table.calls": "Calls", "table.duration": "Duration", "table.cost": "API cost", "table.hint": "Click a row for details",
    "search.placeholder": "Search…", "search.aria": "Search conversations", "model.all": "All models", "filter.model": "Filter by model", "filter.folderAll": "All folders", "filter.folderSelected": "Folders selected: {n}", "filter.folder": "Filter by project or folder", "filter.usage": "Filter by usage", "filter.usageAll": "All usage levels", "filter.usage100k": "≥ 100k tokens", "filter.usage1m": "≥ 1M tokens", "filter.usage10m": "≥ 10M tokens", "filter.reset": "Reset", "conversation.untitled": "Untitled conversation", "conversation.none": "No conversations match these filters.",
    "kpi.credits": "Codex credits", "kpi.officialRates": "official per-token rates", "kpi.fastPremium": "Fast premium", "kpi.fastCalls": "{n} Fast calls detected", "kpi.fastUsage": "{n} Fast calls · {premium} premium", "kpi.standardUsage": "Standard Codex pricing", "kpi.unrated": "{n} unrated calls", "kpi.cost": "API equivalent", "kpi.prices": "configured API prices", "kpi.referenceCalls": "{n} calls use reference pricing", "kpi.tokens": "Tokens processed", "kpi.cacheRate": "{n}% of input was cached", "kpi.calls": "Model calls", "kpi.tokensPerCall": "{n} tokens / call", "kpi.noCall": "no calls", "kpi.exchanges": "Turns", "kpi.conversations": "Conversations: {n}", "kpi.projects": "Active projects", "kpi.median": "Median duration", "kpi.p95": "p95 {value}", "kpi.completed": "completed turns",
    "cost.estimate": "API ESTIMATE", "cost.officialCoverage": "{n}% of calls priced", "cost.referenceCoverage": "{n} calls use the reference rate", "cost.longContext": "{n} calls > 272k · surcharge included", "cost.standardContext": "No calls above 272k tokens", "cost.disclaimer": "Excludes tool fees and cache writes", "cost.fresh": "Fresh input", "cost.cached": "Cached input", "cost.output": "Output", "cost.config": "Adjust rates",
    "projects.label": "PROJECTS", "projects.title": "Cost by project", "projects.hint": "Click a project to filter", "projects.none": "No project in this period", "projects.unknown": "No project", "projects.filter": "Filter on {name}", "chart.cost": "API cost over time", "chart.costHint": "Split by token type",
    "calls.peak": "peak {label} · {n}", "calls.none": "no calls", "calls.count": "{n} calls", "calls.one": "1 call",
    "insight.dominant": "Dominant conversation", "insight.dominantText": "{title} accounts for {n}% of tokens.", "insight.cache": "Effective cache", "insight.cacheText": "{n}% of input tokens were served from cache.", "insight.fast": "Fast premium", "insight.fastText": "{n} Fast calls add {premium} over Standard pricing.", "insight.longest": "Longest turn", "insight.longestText": "{duration} with {calls}.", "insight.noCompleted": "No completed turns in this period.", "insight.quiet": "Quiet period", "insight.quietText": "No model calls found in this period.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} of {total}", "table.tokens": "Tokens", "pagination.label": "Pagination", "pagination.perPage": "Per page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Previous page", "pagination.next": "Next page",
    "detail.label": "CONVERSATION DETAILS", "detail.unknownModel": "unknown model", "detail.configuration": "Detected configuration", "detail.credits": "Codex credits", "detail.cost": "Theoretical API cost", "detail.calls": "Calls", "detail.exchanges": "Turns", "detail.cache": "Input cache", "detail.duration": "Total duration", "detail.periodExchanges": "Turns in this period", "detail.noExchange": "No turns.", "detail.cwd": "Working directory", "detail.id": "Identifier", "detail.unknown": "Not available", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Low", "effort.medium": "Medium", "effort.high": "High", "effort.xhigh": "Extra-high", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Unknown effort", "profile.more": "Other: {n}",
    "pricing.simulation": "ESTIMATE", "pricing.title": "API rates", "pricing.copy": "Prices in US dollars per million tokens. Official GPT-5.6 rates and long-context surcharges are applied. Tool and cache-write fees are not observable in local sessions.", "pricing.reset": "Official defaults", "pricing.save": "Save", "pricing.model": "Model", "pricing.input": "Input", "pricing.reference": "Reference (GPT-5.6 Sol)", "pricing.modelType": "model", "pricing.effortType": "reasoning: {effort}", "pricing.saved": "Prices saved",
    "freshness": "{n} sessions indexed · updated {time}", "refresh.done": "Sessions refreshed", "load.loading": "Loading local sessions…", "load.error": "Unable to read sessions: {error}", "load.errorToast": "Loading error", "units.tokens": "tokens",
    "duration.seconds": "{n}s", "duration.minutes": "{m}m {s}s",
  },
  de: {
    "app.title": "Local Usage — Kosten und Aktivität", "brand.tagline": "für Codex · lokal", "license.independent": "Unabhängige freie Software für lokale Codex-Daten.", "license.source": "Quellcode", "nav.period": "Zeitraum", "action.language": "Sprache", "action.close": "Schließen", "summary.label": "Zusammenfassung des Zeitraums", "summary.kpis": "Wichtigste Kennzahlen",
    "period.today": "Heute", "period.7d": "7 Tage", "period.30d": "30 Tage", "period.all": "Alle",
    "period.todayLabel": "Heute", "period.7dLabel": "Letzte 7 Tage", "period.30dLabel": "Letzte 30 Tage", "period.allLabel": "Gesamter lokaler Verlauf",
    "action.refresh": "Aktualisieren", "action.pricing": "Preise konfigurieren", "hero.title": "Kosten und Aktivität", "hero.privacy": "Nur lokale Daten",
    "section.load": "AKTIVITÄT", "section.distribution": "VERTEILUNG", "section.rhythm": "RHYTHMUS", "section.signal": "SIGNAL", "section.conversations": "DETAIL",
    "chart.tokens": "Tokens im Zeitverlauf", "chart.footprint": "Token-Verteilung", "chart.calls": "Modellaufrufe",
    "token.fresh": "Nicht gecacht", "token.cache": "Cache", "token.output": "Ausgabe", "token.freshLong": "Frische Eingabe", "token.cacheLong": "Gecachte Eingabe",
    "insight.title": "Das Wichtigste", "table.title": "Konversationen", "table.conversation": "Konversation", "table.project": "Projekt", "table.model": "Konfiguration", "table.exchange": "Runde", "table.exchanges": "Runden", "table.calls": "Aufrufe", "table.duration": "Dauer", "table.cost": "API-Kosten", "table.hint": "Zeile anklicken für Details",
    "search.placeholder": "Suchen…", "search.aria": "Konversationen durchsuchen", "model.all": "Alle Modelle", "filter.model": "Nach Modell filtern", "filter.folderAll": "Alle Ordner", "filter.folderSelected": "Ausgewählte Ordner: {n}", "filter.folder": "Nach Projekt oder Ordner filtern", "filter.usage": "Nach Nutzung filtern", "filter.usageAll": "Alle Nutzungsstufen", "filter.usage100k": "≥ 100k Tokens", "filter.usage1m": "≥ 1M Tokens", "filter.usage10m": "≥ 10M Tokens", "filter.reset": "Zurücksetzen", "conversation.untitled": "Unbenannte Konversation", "conversation.none": "Keine Konversationen für diese Filter.",
    "kpi.credits": "Codex-Credits", "kpi.officialRates": "offizielle Token-Tarife", "kpi.fastPremium": "Fast-Aufpreis", "kpi.fastCalls": "{n} Fast-Aufrufe erkannt", "kpi.fastUsage": "{n} Fast-Aufrufe · {premium} Aufpreis", "kpi.standardUsage": "Standard-Codex-Tarif", "kpi.unrated": "{n} Aufrufe ohne Tarif", "kpi.cost": "API-Äquivalent", "kpi.prices": "konfigurierte API-Preise", "kpi.referenceCalls": "{n} Aufrufe zum Referenzpreis", "kpi.tokens": "Verarbeitete Tokens", "kpi.cacheRate": "{n} % der Eingabe aus Cache", "kpi.calls": "Modellaufrufe", "kpi.tokensPerCall": "{n} Tokens / Aufruf", "kpi.noCall": "keine Aufrufe", "kpi.exchanges": "Runden", "kpi.conversations": "Konversationen: {n}", "kpi.projects": "Aktive Projekte", "kpi.median": "Median-Dauer", "kpi.p95": "p95 {value}", "kpi.completed": "abgeschlossene Runden",
    "cost.estimate": "API-SCHÄTZUNG", "cost.officialCoverage": "{n} % der Aufrufe tarifiert", "cost.referenceCoverage": "{n} Aufrufe zum Referenztarif", "cost.longContext": "{n} Aufrufe > 272k · Aufpreis enthalten", "cost.standardContext": "Keine Aufrufe über 272k Tokens", "cost.disclaimer": "Ohne Tool-Gebühren und Cache-Schreibvorgänge", "cost.fresh": "Frische Eingabe", "cost.cached": "Cache-Eingabe", "cost.output": "Ausgabe", "cost.config": "Tarife anpassen",
    "projects.label": "PROJEKTE", "projects.title": "Kosten nach Projekt", "projects.hint": "Projekt anklicken zum Filtern", "projects.none": "Kein Projekt in diesem Zeitraum", "projects.unknown": "Ohne Projekt", "projects.filter": "Nach {name} filtern", "chart.cost": "API-Kosten im Zeitverlauf", "chart.costHint": "Nach Token-Typ aufgeteilt",
    "calls.peak": "Spitze {label} · {n}", "calls.none": "keine Aufrufe", "calls.count": "{n} Aufrufe", "calls.one": "1 Aufruf",
    "insight.dominant": "Dominante Konversation", "insight.dominantText": "{title} verursacht {n} % der Tokens.", "insight.cache": "Effektiver Cache", "insight.cacheText": "{n} % der Eingabe-Tokens kamen aus dem Cache.", "insight.fast": "Fast-Aufpreis", "insight.fastText": "{n} Fast-Aufrufe erhöhen den Standardtarif um {premium}.", "insight.longest": "Längste Runde", "insight.longestText": "{duration} mit {calls}.", "insight.noCompleted": "Keine abgeschlossene Runde in diesem Zeitraum.", "insight.quiet": "Ruhiger Zeitraum", "insight.quietText": "Keine Modellaufrufe in diesem Zeitraum.",
    "table.count": "{n} Konversation{s}", "table.range": "{start}–{end} von {total}", "table.tokens": "Tokens", "pagination.label": "Seitennavigation", "pagination.perPage": "Pro Seite", "pagination.page": "Seite {page} / {pages}", "pagination.previous": "Vorherige Seite", "pagination.next": "Nächste Seite",
    "detail.label": "KONVERSATIONSDETAILS", "detail.unknownModel": "unbekanntes Modell", "detail.configuration": "Erkannte Konfiguration", "detail.credits": "Codex-Credits", "detail.cost": "Theoretische API-Kosten", "detail.calls": "Aufrufe", "detail.exchanges": "Runden", "detail.cache": "Eingabe-Cache", "detail.duration": "Gesamtdauer", "detail.periodExchanges": "Runden im Zeitraum", "detail.noExchange": "Keine Runden.", "detail.cwd": "Arbeitsverzeichnis", "detail.id": "Kennung", "detail.unknown": "Nicht verfügbar", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Niedrig", "effort.medium": "Mittel", "effort.high": "Hoch", "effort.xhigh": "Sehr hoch", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Unbekannter Aufwand", "profile.more": "Weitere: {n}",
    "pricing.simulation": "SCHÄTZUNG", "pricing.title": "API-Tarife", "pricing.copy": "Preise in US-Dollar pro Million Tokens. Offizielle GPT-5.6-Tarife und Langkontext-Aufpreise werden angewendet. Tool- und Cache-Schreibgebühren sind in lokalen Sitzungen nicht sichtbar.", "pricing.reset": "Offizielle Werte", "pricing.save": "Speichern", "pricing.model": "Modell", "pricing.input": "Eingabe", "pricing.reference": "Referenz (GPT-5.6 Sol)", "pricing.modelType": "Modell", "pricing.effortType": "Reasoning: {effort}", "pricing.saved": "Preise gespeichert",
    "freshness": "{n} Sitzungen indexiert · Stand {time}", "refresh.done": "Sitzungen aktualisiert", "load.loading": "Lokale Sitzungen werden geladen…", "load.error": "Sitzungen konnten nicht gelesen werden: {error}", "load.errorToast": "Ladefehler", "units.tokens": "Tokens",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s",
  },
};

for (const [language, messages] of Object.entries(ADDITIONAL_I18N)) {
  I18N[language] = { ...I18N.en, ...messages };
}

const state = {
  data: null,
  period: "today",
  query: "",
  model: "all",
  folders: new Set(),
  usageThreshold: 0,
  page: 1,
  pageSize: 25,
  sortKey: "tokens",
  sortDirection: "desc",
  language: preferredLanguage(),
  pricing: loadPricing(),
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const locale = () => LOCALE_TAGS[state.language] || LOCALE_TAGS.fr;
const t = (key, values = {}) => (I18N[state.language]?.[key] || I18N.fr[key] || key).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? "");
const formatInt = (value) => new Intl.NumberFormat(locale(), { maximumFractionDigits: 0 }).format(value);
const formatCompact = (value) => new Intl.NumberFormat(locale(), { notation: "compact", maximumFractionDigits: 2 }).format(value);
const formatDate = (value) => new Intl.DateTimeFormat(locale(), { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(value);

function loadPricing() {
  try { return mergeApiPricing(JSON.parse(localStorage.getItem("codex-usage-pricing")) || {}); }
  catch { return mergeApiPricing(); }
}

function preferredLanguage() {
  let stored = null;
  try { stored = localStorage.getItem("codex-usage-language"); }
  catch { /* Browser language detection remains available without storage. */ }
  const browserLanguages = navigator.languages || [navigator.language];
  return resolveLanguage(stored ? [stored, ...browserLanguages] : browserLanguages);
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

function inRange(timestamp, range = dateRange()) {
  const time = Date.parse(timestamp);
  const { start, end } = range;
  return Number.isFinite(time) && time >= start.getTime() && time <= end.getTime();
}

function zeroUsage() { return { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0 }; }
function sumUsage(items) { return items.reduce((sum, item) => { for (const key of Object.keys(sum)) sum[key] += item.usage?.[key] || 0; return sum; }, zeroUsage()); }

function modelPriceFor(model) {
  return apiPriceFor(state.pricing, model);
}

function effortPriceKey(model, effort) { return `${model}::${effort}`; }

function priceFor(model, effort = null) {
  return apiPriceFor(state.pricing, model, effort);
}

function costOfCalls(calls) {
  return apiCostOfCalls(calls, state.pricing);
}

function formatCost(value) {
  const digits = value < 0.01 ? 4 : value < 1 ? 3 : 2;
  return new Intl.NumberFormat(locale(), { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits }).format(value);
}

function formatCredits(value) {
  return `${new Intl.NumberFormat(locale(), { minimumFractionDigits: value < 1 ? 3 : 2, maximumFractionDigits: value < 1 ? 3 : 2 }).format(value)} cr`;
}

function creditSummaryMeta(summary) {
  const parts = [];
  if (summary.fastCalls) parts.push(t("kpi.fastUsage", { n: formatInt(summary.fastCalls), premium: formatCredits(summary.fastPremiumCredits) }));
  else parts.push(t("kpi.standardUsage"));
  if (summary.unratedCalls) parts.push(t("kpi.unrated", { n: formatInt(summary.unratedCalls) }));
  return parts.join(" · ");
}

function fastBadge(model, serviceTier) {
  const multiplier = fastMultiplierFor(model, serviceTier);
  return fastMultiplierBadge(multiplier);
}

function fastMultiplierBadge(multiplier) {
  return multiplier > 1 ? `<span class="fast-badge">${t("fast.badge", { n: multiplier })}</span>` : "";
}

function effortLabel(effort) {
  const normalized = String(effort || "").toLowerCase();
  if (!normalized) return t("effort.unknown");
  const key = `effort.${normalized}`;
  const translated = t(key);
  return translated === key ? normalized : translated;
}

function usageProfileMarkup(profile, { showCalls = true } = {}) {
  const modeBadge = profile.fast
    ? fastMultiplierBadge(profile.multiplier)
    : `<span class="standard-badge">${t("mode.standard")}</span>`;
  const calls = profile.calls === 1 ? t("calls.one") : t("calls.count", { n: formatInt(profile.calls) });
  return `<div class="usage-profile${profile.fast ? " is-fast" : ""}"><span class="model-pill">${escapeHtml(profile.model)}</span><span class="effort-badge">${escapeHtml(effortLabel(profile.effort))}</span>${modeBadge}${showCalls ? `<span class="profile-calls">${calls}</span>` : ""}</div>`;
}

function usageProfilesMarkup(calls, { limit = Infinity, compact = false } = {}) {
  const profiles = usageProfilesOfCalls(calls);
  const visible = profiles.slice(0, limit);
  const remaining = profiles.length - visible.length;
  const more = remaining > 0 ? `<span class="profile-more">${t("profile.more", { n: remaining })}</span>` : "";
  return `<div class="usage-profiles${compact ? " compact" : ""}">${visible.map((profile) => usageProfileMarkup(profile)).join("")}${more}</div>`;
}

function formatDuration(ms) {
  if (!ms) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return t("duration.seconds", { n: seconds });
  const minutes = Math.floor(seconds / 60);
  return t("duration.minutes", { m: minutes, s: seconds % 60 });
}

function sessionTitle(session) { return session.title === "Conversation sans titre" ? t("conversation.untitled") : session.title; }
function projectName(session) {
  const parts = String(session.cwd || "").replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.at(-1) || t("projects.unknown");
}

function projectGroups(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const name = projectName(session);
    const group = groups.get(name) || { name, paths: new Set(), sessions: [], calls: [] };
    group.paths.add(session.cwd || "");
    group.sessions.push(session);
    group.calls.push(...session.calls);
    groups.set(name, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, paths: [...group.paths], cost: costOfCalls(group.calls) }))
    .sort((left, right) => right.cost.cost - left.cost.cost);
}

function scopedSessions() {
  if (!state.data) return [];
  const range = dateRange();
  return state.data.sessions.map((session) => {
    if (state.folders.size && !state.folders.has(session.cwd || "")) return null;
    const calls = session.calls.filter((call) => inRange(call.timestamp, range) && (state.model === "all" || call.model === state.model));
    const turns = session.turns.filter((turn) => inRange(turn.startedAt, range) && (state.model === "all" || turn.model === state.model));
    return { ...session, calls, turns, usage: sumUsage(calls), modelCalls: calls.length, exchanges: turns.length, durationMs: turns.reduce((sum, turn) => sum + (turn.durationMs || 0), 0) };
  // Ignore heartbeat/maintenance sessions that complete without a model call;
  // they otherwise swamp the conversation view with zero-token rows.
  }).filter((session) => session?.calls.length);
}

function allScopedCalls(sessions = scopedSessions()) { return sessions.flatMap((session) => session.calls); }

function render() {
  const sessions = scopedSessions();
  const calls = allScopedCalls(sessions);
  const turns = sessions.flatMap((session) => session.turns);
  const usage = sumUsage(calls);
  renderCostSummary(calls);
  renderKpis(sessions, calls, usage);
  renderProjects(sessions);
  renderCostChart(calls);
  renderTable(sessions);
  renderFreshness();
}

function renderCostSummary(calls) {
  const cost = costOfCalls(calls);
  const coverage = Math.round(cost.officialCoverage * 100);
  const coverageText = cost.estimatedCalls
    ? t("cost.referenceCoverage", { n: formatInt(cost.estimatedCalls) })
    : t("cost.officialCoverage", { n: coverage });
  const contextText = cost.longContextCalls
    ? t("cost.longContext", { n: formatInt(cost.longContextCalls) })
    : t("cost.standardContext");
  const parts = [
    { key: "fresh", label: t("cost.fresh"), value: cost.freshInputCost },
    { key: "cached", label: t("cost.cached"), value: cost.cachedInputCost },
    { key: "output", label: t("cost.output"), value: cost.outputCost },
  ];
  $("#costSummary").innerHTML = `
    <div class="cost-topline"><p class="eyebrow">${t("cost.estimate")}</p><span class="cost-coverage">${escapeHtml(coverageText)}</span></div>
    <strong class="cost-value">${formatCost(cost.cost)}</strong>
    <p class="cost-caption">${escapeHtml(contextText)}</p>
    <div class="cost-breakdown">${parts.map((part) => {
      const share = percentageOf(part.value, cost.cost);
      const shareLabel = `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(share)} %`;
      return `<div class="cost-part"><span>${escapeHtml(part.label)}</span><strong>${formatCost(part.value)}</strong><progress class="cost-share ${part.key}" max="100" value="${share}" aria-label="${escapeHtml(`${part.label} · ${shareLabel}`)}"></progress></div>`;
    }).join("")}</div>
    <div class="cost-footnote"><span>${t("cost.disclaimer")}</span><button class="cost-config" type="button">${t("cost.config")}</button></div>`;
  $("#costSummary .cost-config").addEventListener("click", openPricing);
}

function renderKpis(sessions, calls, usage) {
  const credits = codexCreditsOfCalls(calls);
  const cacheRate = usage.inputTokens ? usage.cachedInputTokens / usage.inputTokens : 0;
  const projects = projectGroups(sessions);
  const cards = [
    [t("kpi.projects"), formatInt(projects.length), t("kpi.conversations", { n: sessions.length }), "P"],
    [t("kpi.credits"), formatCredits(credits.credits), creditSummaryMeta(credits), "◇"],
    [t("kpi.tokens"), formatCompact(usage.totalTokens), `${formatInt(usage.totalTokens)} · ${t("kpi.cacheRate", { n: Math.round(cacheRate * 100) })}`, "T"],
    [t("kpi.calls"), formatInt(calls.length), calls.length ? t("kpi.tokensPerCall", { n: formatCompact(usage.totalTokens / calls.length) }) : t("kpi.noCall"), "↗"],
  ];
  $("#kpis").innerHTML = cards.map(([label, value, meta, icon]) => `<article class="kpi"><span class="kpi-label">${label}<b class="kpi-icon">${icon}</b></span><strong class="kpi-value">${value}</strong><span class="kpi-meta" title="${escapeHtml(meta)}">${meta}</span></article>`).join("");
}

function renderProjects(sessions) {
  const groups = projectGroups(sessions);
  const total = groups.reduce((sum, group) => sum + group.cost.cost, 0);
  const max = Math.max(0.0001, ...groups.map((group) => group.cost.cost));
  const visible = groups.slice(0, 6);
  if (!visible.length) {
    $("#projectBreakdown").innerHTML = `<div class="project-empty">${t("projects.none")}</div>`;
    return;
  }
  $("#projectBreakdown").innerHTML = visible.map((group, index) => {
    const active = state.folders.size === group.paths.length && group.paths.every((folder) => state.folders.has(folder));
    const share = total ? group.cost.cost / total * 100 : 0;
    return `<button class="project-row${active ? " active" : ""}" type="button" data-project-index="${index}" aria-pressed="${active}" aria-label="${escapeHtml(t("projects.filter", { name: group.name }))}"><span class="project-name">${escapeHtml(group.name)}</span><span class="project-value">${formatCost(group.cost.cost)}</span><span class="project-meta">${formatInt(group.sessions.length)} · ${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(share)} %</span><progress class="project-bar" max="${max}" value="${group.cost.cost}" aria-label="${escapeHtml(group.name)}"></progress></button>`;
  }).join("");
  $$("#projectBreakdown .project-row").forEach((row) => row.addEventListener("click", () => {
    const group = visible[Number(row.dataset.projectIndex)];
    const active = state.folders.size === group.paths.length && group.paths.every((folder) => state.folders.has(folder));
    state.folders = active ? new Set() : new Set(group.paths);
    state.page = 1;
    $$("#folderFilterOptions input").forEach((input) => { input.checked = state.folders.has(input.value); });
    updateFolderFilterSummary();
    render();
  }));
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

function renderCostChart(calls) {
  const buckets = bucketsFor(calls).map((bucket) => ({ ...bucket, cost: costOfCalls(bucket.calls) }));
  const max = Math.max(0.0001, ...buckets.map((bucket) => bucket.cost.cost));
  $("#costChart").innerHTML = buckets.map((bucket, index) => {
    const segments = stackedChartSegments([
      { key: "fresh", value: bucket.cost.freshInputCost },
      { key: "cached", value: bucket.cost.cachedInputCost },
      { key: "output", value: bucket.cost.outputCost },
    ], max);
    const showLabel = buckets.length <= 12 || index % Math.ceil(buckets.length / 8) === 0;
    const detail = `${bucket.label} · ${formatCost(bucket.cost.cost)}`;
    const rectangles = segments
      .filter((segment) => segment.height > 0)
      .map((segment) => `<rect class="chart-segment ${segment.key}" x="0" y="${segment.y}" width="30" height="${segment.height}"></rect>`)
      .join("");
    return `<div class="chart-column" data-tip="${escapeHtml(detail)}" aria-label="${escapeHtml(detail)}" tabindex="0"><svg class="chart-stack" viewBox="0 0 30 205" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rectangles}</svg><label>${showLabel ? escapeHtml(bucket.label) : ""}</label></div>`;
  }).join("");
}

function renderTable(sessions) {
  const query = normalizeSearch(state.query);
  const prepared = sessions.map((session) => ({
    ...session,
    tableProject: projectName(session),
    tableModel: [...new Set(session.calls.map((call) => call.model))].join(", ") || session.models.join(", ") || "unknown",
    tableProfiles: usageProfilesOfCalls(session.calls),
    tableCost: costOfCalls(session.calls),
    tableCredits: codexCreditsOfCalls(session.calls),
  }));
  const filtered = prepared.filter((session) => {
    const profileSearch = session.tableProfiles.map((profile) => `${profile.model} ${effortLabel(profile.effort)} ${profile.fast ? "fast" : "standard"}`).join(" ");
    const haystack = normalizeSearch(`${sessionTitle(session)} ${session.tableModel} ${profileSearch} ${session.cwd || ""}`);
    return session.usage.totalTokens >= state.usageThreshold && (!query || haystack.includes(query));
  });
  filtered.sort((left, right) => compareSessions(left, right) * (state.sortDirection === "asc" ? 1 : -1));

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIndex = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(startIndex, startIndex + state.pageSize);
  $("#conversationRows").innerHTML = visible.length ? visible.map((session) =>
    `<tr data-session-id="${escapeHtml(session.id)}" tabindex="0"><td><div class="conversation-name">${escapeHtml(sessionTitle(session))}</div><div class="conversation-date">${formatDate(new Date(session.updatedAt))} · ${formatInt(session.exchanges)} ${session.exchanges === 1 ? t("table.exchange") : t("table.exchanges").toLocaleLowerCase(locale())} · ${formatDuration(session.durationMs)}</div></td><td><span class="project-pill" title="${escapeHtml(session.cwd || session.tableProject)}">${escapeHtml(session.tableProject)}</span></td><td>${usageProfilesMarkup(session.calls, { limit: 2, compact: true })}</td><td>${formatInt(session.modelCalls)}</td><td title="${formatInt(session.usage.totalTokens)} ${t("units.tokens")}">${formatCompact(session.usage.totalTokens)}</td><td><div class="cost-stack"><strong>${formatCost(session.tableCost.cost)}${session.tableCost.estimatedCalls ? " ≈" : ""}</strong><span>${formatCredits(session.tableCredits.credits)} Codex</span></div></td></tr>`
  ).join("") : `<tr><td colspan="6" class="empty">${t("conversation.none")}</td></tr>`;
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
  $$("#conversationRows tr[data-session-id]").forEach((row) => {
    row.addEventListener("click", () => openDrawer(row.dataset.sessionId));
    row.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openDrawer(row.dataset.sessionId);
    });
  });
}

function normalizeSearch(value) {
  return String(value || "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase(locale()).trim();
}

function compareSessions(left, right) {
  const values = {
    title: [sessionTitle(left), sessionTitle(right)],
    project: [left.tableProject, right.tableProject],
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
  const cost = costOfCalls(session.calls); const credits = codexCreditsOfCalls(session.calls); const usage = session.usage;
  const turns = session.turns.map((turn, index) => {
    const effort = `<span class="effort-badge">${escapeHtml(effortLabel(turn.effort))}</span>`;
    const mode = fastBadge(turn.model, turn.serviceTier) || `<span class="standard-badge">${t("mode.standard")}</span>`;
    const calls = turn.calls === 1 ? t("calls.one") : t("calls.count", { n: turn.calls });
    return `<div class="turn-row"><div class="turn-identity"><strong>#${index + 1}</strong><span class="model-pill">${escapeHtml(turn.model)}</span>${effort}</div><span>${mode}</span><span>${calls}</span><span>${formatDuration(turn.durationMs)}</span></div>`;
  }).join("") || `<p class="drawer-subtitle">${t("detail.noExchange")}</p>`;
  $("#drawerContent").innerHTML = `
    <p class="eyebrow">${t("detail.label")}</p>
    <h2 id="drawerTitle" class="drawer-title">${escapeHtml(sessionTitle(session))}</h2>
    <p class="drawer-subtitle">${formatDate(new Date(session.startedAt))}</p>
    <section class="configuration-summary" aria-label="${escapeHtml(t("detail.configuration"))}">
      <span class="configuration-label">${t("detail.configuration")}</span>
      ${usageProfilesMarkup(session.calls)}
    </section>
    <div class="detail-kpis">
      <div class="detail-kpi"><span>${t("detail.cost")}</span><strong class="cost">${formatCost(cost.cost)}</strong><small>${cost.estimatedCalls ? t("cost.referenceCoverage", { n: cost.estimatedCalls }) : t("cost.officialCoverage", { n: 100 })}</small></div>
      <div class="detail-kpi"><span>${t("detail.credits")}</span><strong class="credits">${formatCredits(credits.credits)}</strong><small>${creditSummaryMeta(credits)}</small></div>
      <div class="detail-kpi"><span>${t("table.tokens")}</span><strong>${formatCompact(usage.totalTokens)}</strong><small>${formatInt(usage.totalTokens)}</small></div>
      <div class="detail-kpi"><span>${t("detail.calls")}</span><strong>${session.modelCalls}</strong></div>
      <div class="detail-kpi"><span>${t("detail.exchanges")}</span><strong>${session.exchanges}</strong></div>
      <div class="detail-kpi"><span>${t("detail.cache")}</span><strong>${usage.inputTokens ? Math.round(usage.cachedInputTokens / usage.inputTokens * 100) : 0} %</strong></div>
      <div class="detail-kpi"><span>${t("detail.duration")}</span><strong>${formatDuration(session.durationMs)}</strong></div>
    </div>
    <div class="detail-section"><h3>${t("detail.periodExchanges")}</h3>${turns}</div>
    <div class="detail-section"><h3>${t("detail.cwd")}</h3><div class="path-box">${escapeHtml(session.cwd || t("detail.unknown"))}</div></div>
    <div class="detail-section"><h3>${t("detail.id")}</h3><div class="path-box">${escapeHtml(session.id)}</div></div>`;
  $("#detailDrawer").setAttribute("aria-hidden", "false"); document.body.classList.add("drawer-open");
}

function renderFreshness() {
  $("#periodLabel").textContent = t(`period.${state.period}Label`);
  const time = new Date(state.data.generatedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  $("#freshness").textContent = t("freshness", { n: state.data.sessions.length, time });
}

function populateModels() {
  const models = [...new Set(state.data.sessions.flatMap((session) => session.models))].sort();
  $("#modelFilter").innerHTML = `<option value="all">${t("model.all")}</option>${models.map((model) => `<option value="${escapeHtml(model)}">${escapeHtml(model)}</option>`).join("")}`;
  $("#modelFilter").value = state.model;
}

function populateFolders() {
  const folders = [...new Set(state.data.sessions.map((session) => session.cwd).filter(Boolean))].sort((left, right) => left.localeCompare(right, locale(), { sensitivity: "base" }));
  state.folders = new Set([...state.folders].filter((folder) => folders.includes(folder)));
  $("#folderFilterOptions").innerHTML = folders.map((folder) => `<label class="folder-filter-option" title="${escapeHtml(folder)}"><input type="checkbox" value="${escapeHtml(folder)}" ${state.folders.has(folder) ? "checked" : ""}><span>${escapeHtml(folder)}</span></label>`).join("");
  updateFolderFilterSummary();
}

function updateFolderFilterSummary() {
  const selected = state.folders.size;
  const summary = $("#folderFilterSummary");
  summary.textContent = selected ? t("filter.folderSelected", { n: selected }) : t("filter.folderAll");
  summary.setAttribute("aria-label", t("filter.folder"));
}

function openPricing() {
  const models = [...new Set(state.data.sessions.flatMap((session) => session.models))].sort();
  const effortCalls = [...new Map(state.data.sessions.flatMap((session) => session.calls)
    .filter((call) => call.effort)
    .map((call) => [effortPriceKey(call.model, call.effort), call])).values()];
  const rows = [
    { type: "reference", key: "reference", label: t("pricing.reference"), values: state.pricing.reference },
    ...models.map((model) => ({ type: "model", key: model, label: `${model} (${t("pricing.modelType")})`, values: modelPriceFor(model) })),
    ...effortCalls.map((call) => ({ type: "effort", key: effortPriceKey(call.model, call.effort), label: `${call.model} (${t("pricing.effortType", { effort: effortLabel(call.effort) })})`, values: priceFor(call.model, call.effort) })),
  ];
  $("#pricingRows").innerHTML = `<div class="pricing-row pricing-labels"><span>${t("pricing.model")}</span><span>${t("pricing.input")}</span><span>${t("token.cache")}</span><span>${t("token.output")}</span></div>${rows.map((row) => `<div class="pricing-row" data-price-type="${row.type}" data-price-key="${escapeHtml(row.key)}"><label title="${escapeHtml(row.label)}">${escapeHtml(row.label)}${row.type === "effort" && !state.pricing.effortOverrides?.[row.key] ? " ≈" : ""}</label><input type="number" min="0" step="0.001" value="${row.values.input}"><input type="number" min="0" step="0.001" value="${row.values.cached}"><input type="number" min="0" step="0.001" value="${row.values.output}"></div>`).join("")}`;
  $("#pricingDialog").showModal();
}

function savePricing() {
  const pricing = structuredClone(state.pricing);
  pricing.effortOverrides ||= {};
  $$(".pricing-row[data-price-key]").forEach((row) => {
    const [input, cached, output] = [...row.querySelectorAll("input")].map((field) => Math.max(0, Number(field.value) || 0));
    if (row.dataset.priceType === "reference") pricing.reference = { ...pricing.reference, input, cached, output };
    else if (row.dataset.priceType === "effort") pricing.effortOverrides[row.dataset.priceKey] = { input, cached, output };
    else pricing.models[row.dataset.priceKey] = { input, cached, output };
  });
  state.pricing = pricing;
  localStorage.setItem("codex-usage-pricing", JSON.stringify(pricing));
  render();
  toast(t("pricing.saved"));
}

function applyUsageData(data) {
  const changed = state.data?.generatedAt !== data.generatedAt;
  state.data = data;
  saveUsageCache(data);
  if (!changed) return;
  populateModels();
  populateFolders();
  render();
}

let dataRequest = null;

async function loadData(force = false, silent = false) {
  if (!force && !state.data) {
    const cachedData = loadUsageCache();
    if (cachedData) applyUsageData(cachedData);
  }
  if (dataRequest) return dataRequest;
  if (!silent) $("#refreshButton").classList.add("loading");
  dataRequest = (async () => {
  try {
    const response = await fetch(`/api/usage${force ? "?refresh=1" : ""}`); if (!response.ok) throw new Error(`HTTP ${response.status}`);
    applyUsageData(await response.json());
    if (force) toast(t("refresh.done"));
  } catch (error) {
    if (!silent || !state.data) {
      $("#freshness").textContent = t("load.error", { error: error.message });
      toast(t("load.errorToast"));
    }
  } finally {
    $("#refreshButton").classList.remove("loading");
    dataRequest = null;
  }
  })();
  return dataRequest;
}

function escapeHtml(value) { return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
function toast(message) { const element = $("#toast"); element.textContent = message; element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 1800); }

function applyTranslations() {
  document.documentElement.lang = state.language;
  document.title = t("app.title");
  $("#languageSelect").value = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria]').forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria)); });
  $("#pricingButton").title = t("action.pricing");
  $("#pricingButton").setAttribute("aria-label", t("action.pricing"));
  $("#modelFilter").setAttribute("aria-label", t("filter.model"));
  $("#usageFilter").setAttribute("aria-label", t("filter.usage"));
  updateFolderFilterSummary();
  $("#searchInput").setAttribute("aria-label", t("search.aria"));
}

$$('[data-period]').forEach((button) => button.addEventListener("click", () => { $$('[data-period]').forEach((item) => item.classList.remove("active")); button.classList.add("active"); state.period = button.dataset.period; state.page = 1; render(); }));
$("#modelFilter").addEventListener("change", (event) => { state.model = event.target.value; state.page = 1; render(); });
$("#folderFilterOptions").addEventListener("change", (event) => {
  const folder = event.target.value;
  if (!folder) return;
  if (event.target.checked) state.folders.add(folder); else state.folders.delete(folder);
  state.page = 1;
  updateFolderFilterSummary();
  render();
});
$("#usageFilter").addEventListener("change", (event) => { state.usageThreshold = Number(event.target.value); state.page = 1; renderTable(scopedSessions()); });
$("#searchInput").addEventListener("input", (event) => { state.query = event.target.value; state.page = 1; renderTable(scopedSessions()); });
$("#pageSizeSelect").addEventListener("change", (event) => { state.pageSize = Number(event.target.value); state.page = 1; renderTable(scopedSessions()); });
$("#previousPage").addEventListener("click", () => { state.page -= 1; renderTable(scopedSessions()); });
$("#nextPage").addEventListener("click", () => { state.page += 1; renderTable(scopedSessions()); });
$$(".sort-button").forEach((button) => button.addEventListener("click", () => {
  const key = button.dataset.sort;
  if (state.sortKey === key) state.sortDirection = state.sortDirection === "asc" ? "desc" : "asc";
  else { state.sortKey = key; state.sortDirection = ["title", "project", "model"].includes(key) ? "asc" : "desc"; }
  state.page = 1;
  renderTable(scopedSessions());
}));
$("#resetTableFilters").addEventListener("click", () => {
  state.query = "";
  state.model = "all";
  state.folders.clear();
  state.usageThreshold = 0;
  state.sortKey = "tokens";
  state.sortDirection = "desc";
  state.page = 1;
  $("#searchInput").value = "";
  $("#modelFilter").value = "all";
  $("#usageFilter").value = "0";
  $$("#folderFilterOptions input").forEach((input) => { input.checked = false; });
  updateFolderFilterSummary();
  render();
});
$("#languageSelect").addEventListener("change", (event) => {
  state.language = event.target.value;
  localStorage.setItem("codex-usage-language", state.language);
  applyTranslations();
  if (state.data) { populateModels(); populateFolders(); render(); }
});
$("#refreshButton").addEventListener("click", async () => {
  if (dataRequest) await dataRequest;
  await loadData(true);
});
$("#pricingButton").addEventListener("click", openPricing);
$("#savePricing").addEventListener("click", savePricing);
$("#resetPricing").addEventListener("click", () => { state.pricing = mergeApiPricing(DEFAULT_API_PRICING); localStorage.setItem("codex-usage-pricing", JSON.stringify(state.pricing)); $("#pricingDialog").close(); openPricing(); render(); });
$$('[data-close-drawer]').forEach((element) => element.addEventListener("click", () => { $("#detailDrawer").setAttribute("aria-hidden", "true"); document.body.classList.remove("drawer-open"); }));
document.addEventListener("keydown", (event) => { if (event.key === "Escape") { $("#detailDrawer").setAttribute("aria-hidden", "true"); document.body.classList.remove("drawer-open"); } });

applyTranslations();
loadData();
setInterval(() => {
  if (!document.hidden) void pollForNewData();
}, POLL_INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void pollForNewData();
});

let pollRequest = null;

async function pollForNewData() {
  if (!state.data || pollRequest) return;
  pollRequest = (async () => {
    try {
      const response = await fetch("/api/health");
      if (!response.ok) return;
      const status = await response.json();
      if (status.generatedAt && status.generatedAt !== state.data.generatedAt) {
        await loadData(false, true);
      }
    } catch { /* Keep displaying the last snapshot during a transient failure. */ }
    finally { pollRequest = null; }
  })();
  return pollRequest;
}
