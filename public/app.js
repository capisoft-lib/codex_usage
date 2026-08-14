import { codexCreditsOfCalls, fastMultiplierFor, usageProfilesOfCalls } from "./usage-pricing.js";
import { DEFAULT_API_PRICING, apiCostOfCalls, apiPriceFor, mergeApiPricing } from "./api-pricing.js";
import { ADDITIONAL_I18N, LOCALE_TAGS, resolveLanguage } from "./translations.js";
import { chartDrilldownBuckets, nextChartGranularity, percentageOf, stackedChartSegments } from "./visualization.js";
import { latestTimestamp, normalizeCustomRange, resolveDateRange, resolveWeeklyRange, timestampInRange, toDateTimeLocalValue } from "./date-range.js";
import { buildQuotaForecast, weeklyForecastTicks } from "./quota-forecast.js";
import { OVERVIEW_PROJECT_LIMIT, projectIdentity } from "./project-identity.js";

// Paint the last browser snapshot immediately, then replace it from the server's
// background-refreshed snapshot. Session files remain the source of truth.
const USAGE_CACHE_KEY = "codex-usage-data";
const CENTRALIZED_USAGE_CACHE_KEY = "codex-usage-data-centralized";
const USAGE_CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
const POLL_INTERVAL_MS = 15_000;
const CENTRALIZED_POLL_INTERVAL_MS = 60_000;
const CUSTOM_RANGE_KEY = "codex-usage-custom-range";
const DATA_MODE_KEY = "codex-usage-data-mode";
const HOSTED_RUNTIME_HINT = new URLSearchParams(location.search).get("hosted") === "1";
let runtimeCapabilities = {
  apiVersion: 1,
  runtime: HOSTED_RUNTIME_HINT ? "hosted" : "local",
  sources: HOSTED_RUNTIME_HINT ? ["centralized"] : ["local", "centralized"],
  defaultSource: HOSTED_RUNTIME_HINT ? "centralized" : "local",
  canRefresh: true,
  adminUrl: HOSTED_RUNTIME_HINT ? "/admin" : null,
};
const isHostedRuntime = () => ["hosted", "hub"].includes(runtimeCapabilities.runtime);

if (isHostedRuntime()) document.documentElement.dataset.hosted = "true";

const I18N = {
  fr: {
    "app.title": "Local Usage — Coûts et activité", "brand.tagline": "pour Codex · local", "license.independent": "Projet libre et indépendant pour les données locales Codex.", "license.source": "Code source", "nav.period": "Période", "nav.main": "Navigation principale", "nav.overview": "Aperçu", "nav.projects": "Projets", "nav.quota": "Quota hebdomadaire", "nav.conversations": "Conversations", "nav.settings": "Réglages", "action.language": "Langue", "action.close": "Fermer", "summary.label": "Synthèse de la période", "summary.kpis": "Indicateurs principaux",
    "period.today": "Aujourd’hui", "period.7d": "7 jours", "period.30d": "30 jours", "period.all": "Tout", "period.custom": "Personnalisé", "period.customStart": "Début", "period.customEnd": "Fin", "period.now": "Maintenant",
    "period.todayLabel": "Aujourd’hui", "period.7dLabel": "7 derniers jours", "period.30dLabel": "30 derniers jours", "period.allLabel": "Tout l’historique local", "period.customLabel": "Du {start} au {end}",
    "action.refresh": "Actualiser", "action.pricing": "Configurer les tarifs", "hero.title": "Coûts et activité", "hero.privacy": "Données locales uniquement",
    "section.load": "ACTIVITÉ", "section.distribution": "RÉPARTITION", "section.rhythm": "RYTHME", "section.signal": "SIGNAL", "section.conversations": "DÉTAIL",
    "chart.tokens": "Tokens dans le temps", "chart.footprint": "Empreinte tokens", "chart.calls": "Appels modèle",
    "token.fresh": "Non cachés", "token.cache": "Cache", "token.output": "Sortie", "token.freshLong": "Entrée fraîche", "token.cacheLong": "Entrée cache",
    "insight.title": "À retenir", "table.title": "Conversations", "table.conversation": "Conversation", "table.project": "Projet", "table.model": "Configuration", "table.exchange": "échange", "table.exchanges": "Échanges", "table.calls": "Appels", "table.duration": "Durée", "table.cost": "Coût API", "table.hint": "Cliquez sur une ligne pour le détail",
    "search.placeholder": "Rechercher…", "search.aria": "Rechercher une conversation", "model.all": "Tous les modèles", "filter.model": "Filtrer par modèle", "filter.folderAll": "Tous les dossiers", "filter.folderSelected": "Dossiers sélectionnés : {n}", "filter.folder": "Filtrer par projet ou dossier", "filter.usage": "Filtrer par consommation", "filter.usageAll": "Tous les volumes", "filter.usage100k": "≥ 100k tokens", "filter.usage1m": "≥ 1M tokens", "filter.usage10m": "≥ 10M tokens", "filter.reset": "Réinitialiser", "conversation.untitled": "Conversation sans titre", "conversation.none": "Aucune conversation pour ces filtres.",
    "kpi.credits": "Crédits Codex", "kpi.officialRates": "tarifs officiels par token", "kpi.fastPremium": "Prime Fast", "kpi.fastCalls": "{n} appels Fast détectés", "kpi.fastUsage": "{n} appels Fast · prime {premium}", "kpi.standardUsage": "tarification Codex Standard", "kpi.unrated": "{n} appels non tarifés", "kpi.cost": "Équivalent API", "kpi.prices": "tarifs API configurés", "kpi.referenceCalls": "{n} appels au tarif de référence", "kpi.tokens": "Tokens traités", "kpi.cacheRate": "{n} % des entrées en cache", "kpi.calls": "Appels modèle", "kpi.tokensPerCall": "{n} tokens / appel", "kpi.noCall": "aucun appel", "kpi.exchanges": "Échanges", "kpi.conversations": "Conversations : {n}", "kpi.projects": "Projets actifs", "kpi.median": "Durée médiane", "kpi.p95": "p95 {value}", "kpi.completed": "échanges terminés", "kpi.weeklyQuota": "Crédit hebdomadaire", "kpi.remaining": "{n} % restant", "kpi.weeklyReset": "Fin et reset : {date}", "kpi.resetsAvailable": "Resets disponibles : {n}", "kpi.resetsUnknown": "Resets disponibles : non communiqué", "kpi.weeklyUnavailable": "Quota non présent dans les sessions locales",
    "cost.estimate": "ESTIMATION API", "cost.officialCoverage": "{n} % des appels tarifés", "cost.referenceCoverage": "{n} appels au tarif de référence", "cost.fastUsage": "{n} appels Fast API · supplément {premium}", "cost.standardTier": "tarification API Standard", "cost.fastUnavailable": "{n} appels Fast sans tarif API Fast publié", "cost.longContext": "{n} appels > 272 k · majoration incluse", "cost.standardContext": "Aucun appel > 272 k tokens", "cost.disclaimer": "Hors frais d’outils et écritures de cache", "cost.fresh": "Entrée fraîche", "cost.cached": "Entrée cache", "cost.output": "Sortie", "cost.config": "Ajuster les tarifs",
    "projects.label": "PROJETS", "projects.title": "Coût par projet", "projects.hint": "Cliquez sur un projet pour filtrer", "projects.none": "Aucun projet sur cette période", "projects.unknown": "Sans projet", "projects.filter": "Filtrer sur {name}", "chart.cost": "Coût API dans le temps", "chart.costHint": "Ventilé par type de token", "chart.zoomBack": "Retour", "chart.zoomInto": "Afficher le détail de {label}",
    "calls.peak": "pic {label} · {n}", "calls.none": "aucun appel", "calls.count": "{n} appels", "calls.one": "1 appel",
    "insight.dominant": "Conversation dominante", "insight.dominantText": "{title} concentre {n} % des tokens.", "insight.cache": "Cache utile", "insight.cacheText": "{n} % des tokens d’entrée ont bénéficié du cache.", "insight.fast": "Prime Fast", "insight.fastText": "{n} appels Fast ajoutent {premium} au tarif Standard.", "insight.longest": "Échange le plus long", "insight.longestText": "{duration} avec {calls}.", "insight.noCompleted": "Aucun échange terminé sur la période.", "insight.quiet": "Période calme", "insight.quietText": "Aucun appel modèle trouvé sur cette période.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} sur {total}", "table.tokens": "Tokens", "table.lastCall": "Dernier appel", "pagination.label": "Pagination", "pagination.perPage": "Par page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Page précédente", "pagination.next": "Page suivante",
    "detail.label": "DÉTAIL CONVERSATION", "detail.unknownModel": "modèle inconnu", "detail.configuration": "Configuration détectée", "detail.credits": "Crédits Codex", "detail.cost": "Coût API théorique", "detail.calls": "Appels", "detail.exchanges": "Échanges", "detail.cache": "Cache input", "detail.duration": "Durée cumulée", "detail.periodExchanges": "Échanges de la période", "detail.noExchange": "Aucun échange.", "detail.cwd": "Dossier de travail", "detail.id": "Identifiant", "detail.unknown": "Non renseigné", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Low", "effort.medium": "Medium", "effort.high": "High", "effort.xhigh": "Extra-high", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Effort inconnu", "profile.more": "Autres : {n}",
    "pricing.simulation": "ESTIMATION", "pricing.title": "Tarifs API", "pricing.copy": "Prix API Standard en dollars par million de tokens. Le tarif Fast observé et les majorations long contexte sont ensuite appliqués selon la grille officielle. Les frais d’outils et d’écriture de cache ne sont pas observables dans les sessions locales.", "pricing.reset": "Valeurs officielles", "pricing.save": "Enregistrer", "pricing.model": "Modèle", "pricing.input": "Entrée", "pricing.reference": "Référence (GPT-5.6 Sol)", "pricing.modelType": "modèle", "pricing.effortType": "raisonnement : {effort}", "pricing.saved": "Tarifs enregistrés",
    "freshness": "{n} sessions indexées · relevé {time}", "refresh.done": "Sessions actualisées", "load.loading": "Chargement des sessions locales…", "load.error": "Impossible de lire les sessions : {error}", "load.errorToast": "Erreur de chargement", "units.tokens": "tokens",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s", "hero.privacyMesh": "Métadonnées minimisées · réseau privé", "node.all": "Toutes les machines", "filter.node": "Filtrer par machine", "table.node": "Machine", "detail.node": "Machine observée", "freshness.mesh": "{n} sessions · {nodes} machines · relevé {time}",
  },
  en: {
    "app.title": "Local Usage — Costs and activity", "brand.tagline": "for Codex · local", "license.independent": "Independent free software for local Codex data.", "license.source": "Source code", "nav.period": "Period", "nav.main": "Main navigation", "nav.overview": "Overview", "nav.projects": "Projects", "nav.quota": "Weekly Quota", "nav.conversations": "Conversations", "nav.settings": "Settings", "action.language": "Language", "action.close": "Close", "summary.label": "Period summary", "summary.kpis": "Key indicators",
    "period.today": "Today", "period.7d": "7 days", "period.30d": "30 days", "period.all": "All", "period.custom": "Custom", "period.customStart": "Start", "period.customEnd": "End", "period.now": "Now",
    "period.todayLabel": "Today", "period.7dLabel": "Last 7 days", "period.30dLabel": "Last 30 days", "period.allLabel": "All local history", "period.customLabel": "From {start} to {end}",
    "action.refresh": "Refresh", "action.pricing": "Configure prices", "hero.title": "Costs and activity", "hero.privacy": "Local data only",
    "section.load": "ACTIVITY", "section.distribution": "DISTRIBUTION", "section.rhythm": "PACE", "section.signal": "SIGNAL", "section.conversations": "DETAIL",
    "chart.tokens": "Tokens over time", "chart.footprint": "Token footprint", "chart.calls": "Model calls",
    "token.fresh": "Uncached", "token.cache": "Cache", "token.output": "Output", "token.freshLong": "Fresh input", "token.cacheLong": "Cached input",
    "insight.title": "Key takeaways", "table.title": "Conversations", "table.conversation": "Conversation", "table.project": "Project", "table.model": "Configuration", "table.exchange": "turn", "table.exchanges": "Turns", "table.calls": "Calls", "table.duration": "Duration", "table.cost": "API cost", "table.hint": "Click a row for details",
    "search.placeholder": "Search…", "search.aria": "Search conversations", "model.all": "All models", "filter.model": "Filter by model", "filter.folderAll": "All folders", "filter.folderSelected": "Folders selected: {n}", "filter.folder": "Filter by project or folder", "filter.usage": "Filter by usage", "filter.usageAll": "All usage levels", "filter.usage100k": "≥ 100k tokens", "filter.usage1m": "≥ 1M tokens", "filter.usage10m": "≥ 10M tokens", "filter.reset": "Reset", "conversation.untitled": "Untitled conversation", "conversation.none": "No conversations match these filters.",
    "kpi.credits": "Codex credits", "kpi.officialRates": "official per-token rates", "kpi.fastPremium": "Fast premium", "kpi.fastCalls": "{n} Fast calls detected", "kpi.fastUsage": "{n} Fast calls · {premium} premium", "kpi.standardUsage": "Standard Codex pricing", "kpi.unrated": "{n} unrated calls", "kpi.cost": "API equivalent", "kpi.prices": "configured API prices", "kpi.referenceCalls": "{n} calls use reference pricing", "kpi.tokens": "Tokens processed", "kpi.cacheRate": "{n}% of input was cached", "kpi.calls": "Model calls", "kpi.tokensPerCall": "{n} tokens / call", "kpi.noCall": "no calls", "kpi.exchanges": "Turns", "kpi.conversations": "Conversations: {n}", "kpi.projects": "Active projects", "kpi.median": "Median duration", "kpi.p95": "p95 {value}", "kpi.completed": "completed turns", "kpi.weeklyQuota": "Weekly credit", "kpi.remaining": "{n}% remaining", "kpi.weeklyReset": "Ends and resets: {date}", "kpi.resetsAvailable": "Available resets: {n}", "kpi.resetsUnknown": "Available resets: not reported", "kpi.weeklyUnavailable": "Quota not present in local sessions",
    "cost.estimate": "API ESTIMATE", "cost.officialCoverage": "{n}% of calls priced", "cost.referenceCoverage": "{n} calls use the reference rate", "cost.fastUsage": "{n} API Fast calls · {premium} premium", "cost.standardTier": "Standard API pricing", "cost.fastUnavailable": "{n} Fast calls have no published API Fast rate", "cost.longContext": "{n} calls > 272k · surcharge included", "cost.standardContext": "No calls above 272k tokens", "cost.disclaimer": "Excludes tool fees and cache writes", "cost.fresh": "Fresh input", "cost.cached": "Cached input", "cost.output": "Output", "cost.config": "Adjust rates",
    "projects.label": "PROJECTS", "projects.title": "Cost by project", "projects.hint": "Click a project to filter", "projects.none": "No project in this period", "projects.unknown": "No project", "projects.filter": "Filter on {name}", "chart.cost": "API cost over time", "chart.costHint": "Split by token type", "chart.zoomBack": "Back", "chart.zoomInto": "Show details for {label}",
    "calls.peak": "peak {label} · {n}", "calls.none": "no calls", "calls.count": "{n} calls", "calls.one": "1 call",
    "insight.dominant": "Dominant conversation", "insight.dominantText": "{title} accounts for {n}% of tokens.", "insight.cache": "Effective cache", "insight.cacheText": "{n}% of input tokens were served from cache.", "insight.fast": "Fast premium", "insight.fastText": "{n} Fast calls add {premium} over Standard pricing.", "insight.longest": "Longest turn", "insight.longestText": "{duration} with {calls}.", "insight.noCompleted": "No completed turns in this period.", "insight.quiet": "Quiet period", "insight.quietText": "No model calls found in this period.",
    "table.count": "{n} conversation{s}", "table.range": "{start}–{end} of {total}", "table.tokens": "Tokens", "table.lastCall": "Last call", "pagination.label": "Pagination", "pagination.perPage": "Per page", "pagination.page": "Page {page} / {pages}", "pagination.previous": "Previous page", "pagination.next": "Next page",
    "detail.label": "CONVERSATION DETAILS", "detail.unknownModel": "unknown model", "detail.configuration": "Detected configuration", "detail.credits": "Codex credits", "detail.cost": "Theoretical API cost", "detail.calls": "Calls", "detail.exchanges": "Turns", "detail.cache": "Input cache", "detail.duration": "Total duration", "detail.periodExchanges": "Turns in this period", "detail.noExchange": "No turns.", "detail.cwd": "Working directory", "detail.id": "Identifier", "detail.unknown": "Not available", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Low", "effort.medium": "Medium", "effort.high": "High", "effort.xhigh": "Extra-high", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Unknown effort", "profile.more": "Other: {n}",
    "pricing.simulation": "ESTIMATE", "pricing.title": "API rates", "pricing.copy": "Standard API prices in US dollars per million tokens. The observed Fast tier and long-context surcharges are then applied from the official rate card. Tool and cache-write fees are not observable in local sessions.", "pricing.reset": "Official defaults", "pricing.save": "Save", "pricing.model": "Model", "pricing.input": "Input", "pricing.reference": "Reference (GPT-5.6 Sol)", "pricing.modelType": "model", "pricing.effortType": "reasoning: {effort}", "pricing.saved": "Prices saved",
    "freshness": "{n} sessions indexed · updated {time}", "refresh.done": "Sessions refreshed", "load.loading": "Loading local sessions…", "load.error": "Unable to read sessions: {error}", "load.errorToast": "Loading error", "units.tokens": "tokens",
    "duration.seconds": "{n}s", "duration.minutes": "{m}m {s}s", "hero.privacyMesh": "Minimized metadata · private network", "node.all": "All machines", "filter.node": "Filter by machine", "table.node": "Machine", "detail.node": "Observed machine", "freshness.mesh": "{n} sessions · {nodes} machines · updated {time}",
  },
  de: {
    "app.title": "Local Usage — Kosten und Aktivität", "brand.tagline": "für Codex · lokal", "license.independent": "Unabhängige freie Software für lokale Codex-Daten.", "license.source": "Quellcode", "nav.period": "Zeitraum", "nav.main": "Hauptnavigation", "nav.overview": "Übersicht", "nav.projects": "Projekte", "nav.quota": "Wochenkontingent", "nav.conversations": "Konversationen", "nav.settings": "Einstellungen", "action.language": "Sprache", "action.close": "Schließen", "summary.label": "Zusammenfassung des Zeitraums", "summary.kpis": "Wichtigste Kennzahlen",
    "period.today": "Heute", "period.7d": "7 Tage", "period.30d": "30 Tage", "period.all": "Alle", "period.custom": "Benutzerdefiniert", "period.customStart": "Beginn", "period.customEnd": "Ende", "period.now": "Jetzt",
    "period.todayLabel": "Heute", "period.7dLabel": "Letzte 7 Tage", "period.30dLabel": "Letzte 30 Tage", "period.allLabel": "Gesamter lokaler Verlauf", "period.customLabel": "Von {start} bis {end}",
    "action.refresh": "Aktualisieren", "action.pricing": "Preise konfigurieren", "hero.title": "Kosten und Aktivität", "hero.privacy": "Nur lokale Daten",
    "section.load": "AKTIVITÄT", "section.distribution": "VERTEILUNG", "section.rhythm": "RHYTHMUS", "section.signal": "SIGNAL", "section.conversations": "DETAIL",
    "chart.tokens": "Tokens im Zeitverlauf", "chart.footprint": "Token-Verteilung", "chart.calls": "Modellaufrufe",
    "token.fresh": "Nicht gecacht", "token.cache": "Cache", "token.output": "Ausgabe", "token.freshLong": "Frische Eingabe", "token.cacheLong": "Gecachte Eingabe",
    "insight.title": "Das Wichtigste", "table.title": "Konversationen", "table.conversation": "Konversation", "table.project": "Projekt", "table.model": "Konfiguration", "table.exchange": "Runde", "table.exchanges": "Runden", "table.calls": "Aufrufe", "table.duration": "Dauer", "table.cost": "API-Kosten", "table.hint": "Zeile anklicken für Details",
    "search.placeholder": "Suchen…", "search.aria": "Konversationen durchsuchen", "model.all": "Alle Modelle", "filter.model": "Nach Modell filtern", "filter.folderAll": "Alle Ordner", "filter.folderSelected": "Ausgewählte Ordner: {n}", "filter.folder": "Nach Projekt oder Ordner filtern", "filter.usage": "Nach Nutzung filtern", "filter.usageAll": "Alle Nutzungsstufen", "filter.usage100k": "≥ 100k Tokens", "filter.usage1m": "≥ 1M Tokens", "filter.usage10m": "≥ 10M Tokens", "filter.reset": "Zurücksetzen", "conversation.untitled": "Unbenannte Konversation", "conversation.none": "Keine Konversationen für diese Filter.",
    "kpi.credits": "Codex-Credits", "kpi.officialRates": "offizielle Token-Tarife", "kpi.fastPremium": "Fast-Aufpreis", "kpi.fastCalls": "{n} Fast-Aufrufe erkannt", "kpi.fastUsage": "{n} Fast-Aufrufe · {premium} Aufpreis", "kpi.standardUsage": "Standard-Codex-Tarif", "kpi.unrated": "{n} Aufrufe ohne Tarif", "kpi.cost": "API-Äquivalent", "kpi.prices": "konfigurierte API-Preise", "kpi.referenceCalls": "{n} Aufrufe zum Referenzpreis", "kpi.tokens": "Verarbeitete Tokens", "kpi.cacheRate": "{n} % der Eingabe aus Cache", "kpi.calls": "Modellaufrufe", "kpi.tokensPerCall": "{n} Tokens / Aufruf", "kpi.noCall": "keine Aufrufe", "kpi.exchanges": "Runden", "kpi.conversations": "Konversationen: {n}", "kpi.projects": "Aktive Projekte", "kpi.median": "Median-Dauer", "kpi.p95": "p95 {value}", "kpi.completed": "abgeschlossene Runden", "kpi.weeklyQuota": "Wöchentliches Guthaben", "kpi.remaining": "{n} % verbleibend", "kpi.weeklyReset": "Ende und Reset: {date}", "kpi.resetsAvailable": "Verfügbare Resets: {n}", "kpi.resetsUnknown": "Verfügbare Resets: nicht gemeldet", "kpi.weeklyUnavailable": "Kontingent nicht in lokalen Sitzungen vorhanden",
    "cost.estimate": "API-SCHÄTZUNG", "cost.officialCoverage": "{n} % der Aufrufe tarifiert", "cost.referenceCoverage": "{n} Aufrufe zum Referenztarif", "cost.fastUsage": "{n} API-Fast-Aufrufe · {premium} Aufpreis", "cost.standardTier": "Standard-API-Tarif", "cost.fastUnavailable": "{n} Fast-Aufrufe ohne veröffentlichten API-Fast-Tarif", "cost.longContext": "{n} Aufrufe > 272k · Aufpreis enthalten", "cost.standardContext": "Keine Aufrufe über 272k Tokens", "cost.disclaimer": "Ohne Tool-Gebühren und Cache-Schreibvorgänge", "cost.fresh": "Frische Eingabe", "cost.cached": "Cache-Eingabe", "cost.output": "Ausgabe", "cost.config": "Tarife anpassen",
    "projects.label": "PROJEKTE", "projects.title": "Kosten nach Projekt", "projects.hint": "Projekt anklicken zum Filtern", "projects.none": "Kein Projekt in diesem Zeitraum", "projects.unknown": "Ohne Projekt", "projects.filter": "Nach {name} filtern", "chart.cost": "API-Kosten im Zeitverlauf", "chart.costHint": "Nach Token-Typ aufgeteilt", "chart.zoomBack": "Zurück", "chart.zoomInto": "Details für {label} anzeigen",
    "calls.peak": "Spitze {label} · {n}", "calls.none": "keine Aufrufe", "calls.count": "{n} Aufrufe", "calls.one": "1 Aufruf",
    "insight.dominant": "Dominante Konversation", "insight.dominantText": "{title} verursacht {n} % der Tokens.", "insight.cache": "Effektiver Cache", "insight.cacheText": "{n} % der Eingabe-Tokens kamen aus dem Cache.", "insight.fast": "Fast-Aufpreis", "insight.fastText": "{n} Fast-Aufrufe erhöhen den Standardtarif um {premium}.", "insight.longest": "Längste Runde", "insight.longestText": "{duration} mit {calls}.", "insight.noCompleted": "Keine abgeschlossene Runde in diesem Zeitraum.", "insight.quiet": "Ruhiger Zeitraum", "insight.quietText": "Keine Modellaufrufe in diesem Zeitraum.",
    "table.count": "{n} Konversation{s}", "table.range": "{start}–{end} von {total}", "table.tokens": "Tokens", "table.lastCall": "Letzter Aufruf", "pagination.label": "Seitennavigation", "pagination.perPage": "Pro Seite", "pagination.page": "Seite {page} / {pages}", "pagination.previous": "Vorherige Seite", "pagination.next": "Nächste Seite",
    "detail.label": "KONVERSATIONSDETAILS", "detail.unknownModel": "unbekanntes Modell", "detail.configuration": "Erkannte Konfiguration", "detail.credits": "Codex-Credits", "detail.cost": "Theoretische API-Kosten", "detail.calls": "Aufrufe", "detail.exchanges": "Runden", "detail.cache": "Eingabe-Cache", "detail.duration": "Gesamtdauer", "detail.periodExchanges": "Runden im Zeitraum", "detail.noExchange": "Keine Runden.", "detail.cwd": "Arbeitsverzeichnis", "detail.id": "Kennung", "detail.unknown": "Nicht verfügbar", "fast.badge": "Fast ×{n}", "mode.standard": "Standard", "effort.minimal": "Minimal", "effort.low": "Niedrig", "effort.medium": "Mittel", "effort.high": "Hoch", "effort.xhigh": "Sehr hoch", "effort.max": "Maximum", "effort.ultra": "Ultra", "effort.unknown": "Unbekannter Aufwand", "profile.more": "Weitere: {n}",
    "pricing.simulation": "SCHÄTZUNG", "pricing.title": "API-Tarife", "pricing.copy": "Standard-API-Preise in US-Dollar pro Million Tokens. Der beobachtete Fast-Tarif und Langkontext-Aufpreise werden anschließend gemäß offizieller Preisliste angewendet. Tool- und Cache-Schreibgebühren sind in lokalen Sitzungen nicht sichtbar.", "pricing.reset": "Offizielle Werte", "pricing.save": "Speichern", "pricing.model": "Modell", "pricing.input": "Eingabe", "pricing.reference": "Referenz (GPT-5.6 Sol)", "pricing.modelType": "Modell", "pricing.effortType": "Reasoning: {effort}", "pricing.saved": "Preise gespeichert",
    "freshness": "{n} Sitzungen indexiert · Stand {time}", "refresh.done": "Sitzungen aktualisiert", "load.loading": "Lokale Sitzungen werden geladen…", "load.error": "Sitzungen konnten nicht gelesen werden: {error}", "load.errorToast": "Ladefehler", "units.tokens": "Tokens",
    "duration.seconds": "{n} s", "duration.minutes": "{m} min {s} s", "hero.privacyMesh": "Minimierte Metadaten · privates Netzwerk", "node.all": "Alle Geräte", "filter.node": "Nach Gerät filtern", "table.node": "Gerät", "detail.node": "Beobachtetes Gerät", "freshness.mesh": "{n} Sitzungen · {nodes} Geräte · Stand {time}",
  },
};

for (const [language, messages] of Object.entries(ADDITIONAL_I18N)) {
  I18N[language] = { ...I18N.en, ...messages };
}

const MESH_I18N = {
  fr: { "hero.privacyMesh": "Métadonnées minimisées · réseau privé", "node.all": "Toutes les machines", "node.local": "Ce PC", "filter.node": "Filtrer par machine", "table.node": "Machine", "detail.node": "Machine observée", "freshness.mesh": "{n} sessions · {nodes} machines · relevé {time}" },
  en: { "hero.privacyMesh": "Minimized metadata · private network", "node.all": "All machines", "node.local": "This PC", "filter.node": "Filter by machine", "table.node": "Machine", "detail.node": "Observed machine", "freshness.mesh": "{n} sessions · {nodes} machines · updated {time}" },
  de: { "hero.privacyMesh": "Minimierte Metadaten · privates Netzwerk", "node.all": "Alle Geräte", "node.local": "Dieser PC", "filter.node": "Nach Gerät filtern", "table.node": "Gerät", "detail.node": "Beobachtetes Gerät", "freshness.mesh": "{n} Sitzungen · {nodes} Geräte · Stand {time}" },
  es: { "hero.privacyMesh": "Metadatos minimizados · red privada", "node.all": "Todos los equipos", "node.local": "Este PC", "filter.node": "Filtrar por equipo", "table.node": "Equipo", "detail.node": "Equipo observado", "freshness.mesh": "{n} sesiones · {nodes} equipos · actualizado {time}" },
  it: { "hero.privacyMesh": "Metadati minimizzati · rete privata", "node.all": "Tutti i computer", "node.local": "Questo PC", "filter.node": "Filtra per computer", "table.node": "Computer", "detail.node": "Computer osservato", "freshness.mesh": "{n} sessioni · {nodes} computer · aggiornato {time}" },
  pt: { "hero.privacyMesh": "Metadados minimizados · rede privada", "node.all": "Todos os computadores", "node.local": "Este PC", "filter.node": "Filtrar por computador", "table.node": "Computador", "detail.node": "Computador observado", "freshness.mesh": "{n} sessões · {nodes} computadores · atualizado às {time}" },
  ja: { "hero.privacyMesh": "最小化されたメタデータ · プライベートネットワーク", "node.all": "すべてのマシン", "node.local": "このPC", "filter.node": "マシンで絞り込む", "table.node": "マシン", "detail.node": "観測したマシン", "freshness.mesh": "{n}件のセッション · {nodes}台 · {time}更新" },
  ru: { "hero.privacyMesh": "Минимизированные метаданные · частная сеть", "node.all": "Все компьютеры", "node.local": "Этот ПК", "filter.node": "Фильтр по компьютеру", "table.node": "Компьютер", "detail.node": "Компьютер наблюдения", "freshness.mesh": "Сеансов: {n} · компьютеров: {nodes} · обновлено в {time}" },
  zh: { "hero.privacyMesh": "最小化元数据 · 私有网络", "node.all": "所有设备", "node.local": "此电脑", "filter.node": "按设备筛选", "table.node": "设备", "detail.node": "观测设备", "freshness.mesh": "{n} 个会话 · {nodes} 台设备 · {time} 更新" },
};
for (const [language, messages] of Object.entries(MESH_I18N)) Object.assign(I18N[language], messages);

const DATA_MODE_I18N = {
  fr: { "data.source": "Source des données", "data.local": "Local", "data.centralized": "Centralisé", "load.loadingCentralized": "Chargement des données centralisées…", "refresh.doneCentralized": "Données centralisées actualisées" },
  en: { "data.source": "Data source", "data.local": "Local", "data.centralized": "Centralized", "load.loadingCentralized": "Loading centralized data…", "refresh.doneCentralized": "Centralized data refreshed" },
  de: { "data.source": "Datenquelle", "data.local": "Lokal", "data.centralized": "Zentral", "load.loadingCentralized": "Zentrale Daten werden geladen…", "refresh.doneCentralized": "Zentrale Daten aktualisiert" },
  es: { "data.source": "Fuente de datos", "data.local": "Local", "data.centralized": "Centralizado", "load.loadingCentralized": "Cargando datos centralizados…", "refresh.doneCentralized": "Datos centralizados actualizados" },
  it: { "data.source": "Origine dati", "data.local": "Locale", "data.centralized": "Centralizzato", "load.loadingCentralized": "Caricamento dei dati centralizzati…", "refresh.doneCentralized": "Dati centralizzati aggiornati" },
  pt: { "data.source": "Fonte de dados", "data.local": "Local", "data.centralized": "Centralizado", "load.loadingCentralized": "A carregar dados centralizados…", "refresh.doneCentralized": "Dados centralizados atualizados" },
  ja: { "data.source": "データソース", "data.local": "ローカル", "data.centralized": "集中管理", "load.loadingCentralized": "集中データを読み込み中…", "refresh.doneCentralized": "集中データを更新しました" },
  ru: { "data.source": "Источник данных", "data.local": "Локально", "data.centralized": "Централизованно", "load.loadingCentralized": "Загрузка централизованных данных…", "refresh.doneCentralized": "Централизованные данные обновлены" },
  zh: { "data.source": "数据来源", "data.local": "本地", "data.centralized": "集中", "load.loadingCentralized": "正在加载集中数据…", "refresh.doneCentralized": "集中数据已刷新" },
};
for (const [language, messages] of Object.entries(DATA_MODE_I18N)) Object.assign(I18N[language], messages);

const PAGE_I18N = {
  fr: {
    "overview.recent": "Conversations récentes", "overview.viewAll": "Voir tout",
    "projects.viewAll": "Tous les projets", "projects.select": "Sélectionnez un projet pour voir son détail.", "projects.models": "Coût par modèle", "projects.openConversations": "Voir les conversations", "search.projects": "Rechercher un projet…",
    "quota.window": "Fenêtre hebdomadaire", "quota.weekCost": "Coût de la semaine", "quota.weekTokens": "Tokens de la semaine", "quota.weekCredits": "Crédits de la semaine",
    "quota.forecastEyebrow": "PRÉVISION", "quota.forecastTitle": "Projection à la fin de la fenêtre", "quota.forecastHint": "EMA 24 h · recalée sur le quota Codex", "quota.forecastAtReset": "Prévision au reset", "quota.emaHour": "Moyenne EMA / heure", "quota.emaDay": "Moyenne EMA / jour", "quota.margin": "{n} % de marge prévue", "quota.overrun": "{n} % au-dessus de la limite", "quota.actual": "Consommé", "quota.projected": "Prévision", "quota.limit": "Limite 100 %", "quota.renew": "Renew", "quota.reset": "Reset", "quota.observed": "Observé", "quota.unavailable": "Prévision indisponible : le quota hebdomadaire et sa date de reset doivent être communiqués.", "quota.insufficient": "Pas encore assez de consommation observée pour calibrer la prévision.", "quota.forecastAria": "Consommation hebdomadaire observée et projetée du quota",
    "settings.source": "Source des données", "settings.sourceCopy": "Local lit les sessions de cette machine. Centralisé agrège les nœuds du réseau privé.", "settings.pricingHint": "Cette estimation reproduit les tarifs API Standard ou Fast observés et ne représente pas votre abonnement Codex.", "settings.machines": "Machines observées", "settings.noMachines": "Aucune machine mesh pour le moment. Le mode local n’affiche que ce PC.", "settings.machineAdmin": "Administration Mesh", "settings.machineAdminCopy": "Ajoutez ou révoquez les machines autorisées à synchroniser avec ce Site privé.", "settings.openMachineAdmin": "Gérer les machines", "brand.taglineHosted": "pour Codex · centralisé privé", "license.independentHosted": "Dashboard privé et indépendant pour les métadonnées Codex agrégées.",
  },
  en: {
    "overview.recent": "Recent conversations", "overview.viewAll": "View all",
    "projects.viewAll": "All projects", "projects.select": "Select a project to see its details.", "projects.models": "Cost by model", "projects.openConversations": "View conversations", "search.projects": "Search projects…",
    "quota.window": "Weekly window", "quota.weekCost": "Cost this week", "quota.weekTokens": "Tokens this week", "quota.weekCredits": "Credits this week",
    "quota.forecastEyebrow": "FORECAST", "quota.forecastTitle": "End-of-window projection", "quota.forecastHint": "24h EMA · calibrated to the Codex quota", "quota.forecastAtReset": "Forecast at reset", "quota.emaHour": "EMA average / hour", "quota.emaDay": "EMA average / day", "quota.margin": "{n}% expected headroom", "quota.overrun": "{n}% above the limit", "quota.actual": "Consumed", "quota.projected": "Forecast", "quota.limit": "100% limit", "quota.renew": "Renew", "quota.reset": "Reset", "quota.observed": "Observed", "quota.unavailable": "Forecast unavailable: the weekly quota and its reset date must be reported.", "quota.insufficient": "Not enough observed consumption yet to calibrate the forecast.", "quota.forecastAria": "Observed and projected weekly quota consumption",
    "settings.source": "Data source", "settings.sourceCopy": "Local reads sessions from this machine. Centralized aggregates nodes on the private network.", "settings.pricingHint": "This estimate reproduces the observed Standard or Fast API rates and does not represent your Codex subscription.", "settings.machines": "Observed machines", "settings.noMachines": "No mesh machines yet. Local mode only shows this PC.", "settings.machineAdmin": "Mesh administration", "settings.machineAdminCopy": "Add or revoke machines allowed to synchronize with this private Site.", "settings.openMachineAdmin": "Manage machines", "brand.taglineHosted": "for Codex · private centralized", "license.independentHosted": "Private independent dashboard for aggregated Codex metadata.",
  },
  de: {
    "overview.recent": "Letzte Konversationen", "overview.viewAll": "Alle anzeigen",
    "projects.viewAll": "Alle Projekte", "projects.select": "Wählen Sie ein Projekt, um die Details zu sehen.", "projects.models": "Kosten nach Modell", "projects.openConversations": "Konversationen anzeigen", "search.projects": "Projekte suchen…",
    "quota.window": "Wochenfenster", "quota.weekCost": "Kosten dieser Woche", "quota.weekTokens": "Tokens dieser Woche", "quota.weekCredits": "Credits dieser Woche",
    "quota.forecastEyebrow": "PROGNOSE", "quota.forecastTitle": "Projektion zum Fensterende", "quota.forecastHint": "24-h-EMA · am Codex-Kontingent kalibriert", "quota.forecastAtReset": "Prognose beim Reset", "quota.emaHour": "EMA-Mittel / Stunde", "quota.emaDay": "EMA-Mittel / Tag", "quota.margin": "{n} % erwartete Reserve", "quota.overrun": "{n} % über dem Limit", "quota.actual": "Verbraucht", "quota.projected": "Prognose", "quota.limit": "100-%-Limit", "quota.renew": "Beginn", "quota.reset": "Reset", "quota.observed": "Beobachtet", "quota.unavailable": "Prognose nicht verfügbar: Wochenkontingent und Reset-Datum müssen gemeldet sein.", "quota.insufficient": "Noch nicht genug Verbrauchsdaten zur Kalibrierung der Prognose.", "quota.forecastAria": "Beobachteter und prognostizierter Verbrauch des Wochenkontingents",
    "settings.source": "Datenquelle", "settings.sourceCopy": "Lokal liest Sitzungen dieser Maschine. Zentral aggregiert Knoten im privaten Netzwerk.", "settings.pricingHint": "Diese Schätzung bildet die beobachteten Standard- oder Fast-API-Tarife ab und entspricht nicht Ihrem Codex-Abo.", "settings.machines": "Beobachtete Geräte", "settings.noMachines": "Noch keine Mesh-Geräte. Der lokale Modus zeigt nur diesen PC.", "settings.machineAdmin": "Mesh-Verwaltung", "settings.machineAdminCopy": "Fügen Sie Computer hinzu oder widerrufen Sie deren Zugriff auf diese private Site.", "settings.openMachineAdmin": "Computer verwalten", "brand.taglineHosted": "für Codex · privat zentralisiert", "license.independentHosted": "Privates unabhängiges Dashboard für aggregierte Codex-Metadaten.",
  },
  es: {
    "overview.recent": "Conversaciones recientes", "overview.viewAll": "Ver todo",
    "projects.viewAll": "Todos los proyectos", "projects.select": "Selecciona un proyecto para ver su detalle.", "projects.models": "Coste por modelo", "projects.openConversations": "Ver conversaciones", "search.projects": "Buscar proyectos…",
    "quota.window": "Ventana semanal", "quota.weekCost": "Coste de la semana", "quota.weekTokens": "Tokens de la semana", "quota.weekCredits": "Créditos de la semana",
    "quota.forecastEyebrow": "PREVISIÓN", "quota.forecastTitle": "Proyección al final de la ventana", "quota.forecastHint": "EMA de 24 h · calibrada con la cuota de Codex", "quota.forecastAtReset": "Previsión al reiniciar", "quota.emaHour": "Media EMA / hora", "quota.emaDay": "Media EMA / día", "quota.margin": "{n} % de margen previsto", "quota.overrun": "{n} % por encima del límite", "quota.actual": "Consumido", "quota.projected": "Previsión", "quota.limit": "Límite del 100 %", "quota.renew": "Renovación", "quota.reset": "Reinicio", "quota.observed": "Observado", "quota.unavailable": "Previsión no disponible: deben conocerse la cuota semanal y su fecha de reinicio.", "quota.insufficient": "Aún no hay suficiente consumo observado para calibrar la previsión.", "quota.forecastAria": "Consumo semanal de cuota observado y proyectado",
    "settings.source": "Fuente de datos", "settings.sourceCopy": "Local lee las sesiones de este equipo. Centralizado agrega los nodos de la red privada.", "settings.pricingHint": "Esta estimación reproduce las tarifas API Standard o Fast observadas y no representa tu suscripción Codex.", "settings.machines": "Equipos observados", "settings.noMachines": "Aún no hay equipos mesh. El modo local solo muestra este PC.",
  },
  it: {
    "overview.recent": "Conversazioni recenti", "overview.viewAll": "Vedi tutto",
    "projects.viewAll": "Tutti i progetti", "projects.select": "Seleziona un progetto per vederne i dettagli.", "projects.models": "Costo per modello", "projects.openConversations": "Vedi conversazioni", "search.projects": "Cerca progetti…",
    "quota.window": "Finestra settimanale", "quota.weekCost": "Costo della settimana", "quota.weekTokens": "Token della settimana", "quota.weekCredits": "Crediti della settimana",
    "quota.forecastEyebrow": "PREVISIONE", "quota.forecastTitle": "Proiezione a fine finestra", "quota.forecastHint": "EMA 24 h · calibrata sulla quota Codex", "quota.forecastAtReset": "Previsione al reset", "quota.emaHour": "Media EMA / ora", "quota.emaDay": "Media EMA / giorno", "quota.margin": "{n} % di margine previsto", "quota.overrun": "{n} % oltre il limite", "quota.actual": "Consumata", "quota.projected": "Previsione", "quota.limit": "Limite 100 %", "quota.renew": "Rinnovo", "quota.reset": "Reset", "quota.observed": "Osservato", "quota.unavailable": "Previsione non disponibile: devono essere indicati quota settimanale e data di reset.", "quota.insufficient": "Consumo osservato ancora insufficiente per calibrare la previsione.", "quota.forecastAria": "Consumo della quota settimanale osservato e previsto",
    "settings.source": "Origine dati", "settings.sourceCopy": "Locale legge le sessioni di questo computer. Centralizzato aggrega i nodi della rete privata.", "settings.pricingHint": "Questa stima riproduce le tariffe API Standard o Fast osservate e non rappresenta l’abbonamento Codex.", "settings.machines": "Computer osservati", "settings.noMachines": "Nessun computer mesh al momento. La modalità locale mostra solo questo PC.",
  },
  pt: {
    "overview.recent": "Conversas recentes", "overview.viewAll": "Ver tudo",
    "projects.viewAll": "Todos os projetos", "projects.select": "Selecione um projeto para ver os detalhes.", "projects.models": "Custo por modelo", "projects.openConversations": "Ver conversas", "search.projects": "Pesquisar projetos…",
    "quota.window": "Janela semanal", "quota.weekCost": "Custo da semana", "quota.weekTokens": "Tokens da semana", "quota.weekCredits": "Créditos da semana",
    "quota.forecastEyebrow": "PREVISÃO", "quota.forecastTitle": "Projeção no fim da janela", "quota.forecastHint": "EMA de 24 h · calibrada pela quota Codex", "quota.forecastAtReset": "Previsão no reset", "quota.emaHour": "Média EMA / hora", "quota.emaDay": "Média EMA / dia", "quota.margin": "{n} % de margem prevista", "quota.overrun": "{n} % acima do limite", "quota.actual": "Consumido", "quota.projected": "Previsão", "quota.limit": "Limite de 100 %", "quota.renew": "Renovação", "quota.reset": "Reset", "quota.observed": "Observado", "quota.unavailable": "Previsão indisponível: a quota semanal e a data de reset têm de ser comunicadas.", "quota.insufficient": "Ainda não há consumo observado suficiente para calibrar a previsão.", "quota.forecastAria": "Consumo semanal da quota observado e projetado",
    "settings.source": "Fonte de dados", "settings.sourceCopy": "Local lê as sessões desta máquina. Centralizado agrega os nós da rede privada.", "settings.pricingHint": "Esta estimativa reproduz as tarifas API Standard ou Fast observadas e não representa a sua subscrição Codex.", "settings.machines": "Computadores observados", "settings.noMachines": "Ainda não há máquinas mesh. O modo local mostra apenas este PC.",
  },
  ja: {
    "overview.recent": "最近の会話", "overview.viewAll": "すべて表示",
    "projects.viewAll": "すべてのプロジェクト", "projects.select": "プロジェクトを選ぶと詳細を表示します。", "projects.models": "モデル別コスト", "projects.openConversations": "会話を表示", "search.projects": "プロジェクトを検索…",
    "quota.window": "週間ウィンドウ", "quota.weekCost": "今週のコスト", "quota.weekTokens": "今週のトークン", "quota.weekCredits": "今週のクレジット",
    "quota.forecastEyebrow": "予測", "quota.forecastTitle": "期間終了時の予測", "quota.forecastHint": "24時間EMA・Codexクォータで較正", "quota.forecastAtReset": "リセット時の予測", "quota.emaHour": "EMA平均 / 時間", "quota.emaDay": "EMA平均 / 日", "quota.margin": "予測余裕 {n}%", "quota.overrun": "上限を {n}% 超過", "quota.actual": "消費済み", "quota.projected": "予測", "quota.limit": "100% 上限", "quota.renew": "更新", "quota.reset": "リセット", "quota.observed": "観測時点", "quota.unavailable": "予測できません。週間クォータとリセット日時が必要です。", "quota.insufficient": "予測を較正するための観測消費量がまだ不足しています。", "quota.forecastAria": "週間クォータ消費量の実績と予測",
    "settings.source": "データソース", "settings.sourceCopy": "ローカルはこのマシンのセッションを読みます。集中管理はプライベートネットワーク上のノードを集約します。", "settings.pricingHint": "この見積もりは観測されたAPI StandardまたはFast料金を再現し、Codexサブスクリプションを表すものではありません。", "settings.machines": "観測したマシン", "settings.noMachines": "Meshマシンはまだありません。ローカルモードはこのPCのみを表示します。",
  },
  ru: {
    "overview.recent": "Недавние диалоги", "overview.viewAll": "Показать все",
    "projects.viewAll": "Все проекты", "projects.select": "Выберите проект, чтобы увидеть подробности.", "projects.models": "Стоимость по моделям", "projects.openConversations": "Показать диалоги", "search.projects": "Поиск проектов…",
    "quota.window": "Недельное окно", "quota.weekCost": "Стоимость за неделю", "quota.weekTokens": "Токены за неделю", "quota.weekCredits": "Кредиты за неделю",
    "quota.forecastEyebrow": "ПРОГНОЗ", "quota.forecastTitle": "Прогноз к концу окна", "quota.forecastHint": "EMA за 24 ч · калибровка по квоте Codex", "quota.forecastAtReset": "Прогноз к сбросу", "quota.emaHour": "Среднее EMA / час", "quota.emaDay": "Среднее EMA / день", "quota.margin": "Ожидаемый запас {n} %", "quota.overrun": "На {n} % выше лимита", "quota.actual": "Израсходовано", "quota.projected": "Прогноз", "quota.limit": "Лимит 100 %", "quota.renew": "Начало", "quota.reset": "Сброс", "quota.observed": "Наблюдение", "quota.unavailable": "Прогноз недоступен: необходимы недельная квота и дата её сброса.", "quota.insufficient": "Пока недостаточно данных о расходе для калибровки прогноза.", "quota.forecastAria": "Наблюдаемый и прогнозируемый расход недельной квоты",
    "settings.source": "Источник данных", "settings.sourceCopy": "Локальный режим читает сеансы этого компьютера. Централизованный агрегирует узлы частной сети.", "settings.pricingHint": "Эта оценка воспроизводит наблюдаемые тарифы API Standard или Fast и не соответствует подписке Codex.", "settings.machines": "Наблюдаемые компьютеры", "settings.noMachines": "Пока нет компьютеров mesh. Локальный режим показывает только этот ПК.",
  },
  zh: {
    "overview.recent": "最近对话", "overview.viewAll": "查看全部",
    "projects.viewAll": "全部项目", "projects.select": "选择一个项目以查看详情。", "projects.models": "按模型成本", "projects.openConversations": "查看对话", "search.projects": "搜索项目…",
    "quota.window": "每周窗口", "quota.weekCost": "本周成本", "quota.weekTokens": "本周令牌", "quota.weekCredits": "本周点数",
    "quota.forecastEyebrow": "预测", "quota.forecastTitle": "窗口结束时预测", "quota.forecastHint": "24 小时 EMA · 按 Codex 额度校准", "quota.forecastAtReset": "重置时预测", "quota.emaHour": "EMA 平均 / 小时", "quota.emaDay": "EMA 平均 / 天", "quota.margin": "预计剩余 {n}%", "quota.overrun": "超出上限 {n}%", "quota.actual": "已消耗", "quota.projected": "预测", "quota.limit": "100% 上限", "quota.renew": "续期", "quota.reset": "重置", "quota.observed": "观测", "quota.unavailable": "无法预测：必须提供每周额度及重置日期。", "quota.insufficient": "观测到的消耗量不足，暂时无法校准预测。", "quota.forecastAria": "每周额度的已观测和预测消耗",
    "settings.source": "数据来源", "settings.sourceCopy": "本地读取此电脑的会话。集中模式汇总私有网络中的节点。", "settings.pricingHint": "此估算会重现观测到的API Standard或Fast价格，并不代表你的Codex订阅。", "settings.machines": "观测设备", "settings.noMachines": "尚无 mesh 设备。本地模式只显示此电脑。",
  },
};
for (const [language, messages] of Object.entries(PAGE_I18N)) Object.assign(I18N[language], messages);

const PAGES = ["overview", "projects", "quota", "conversations", "settings"];
const PAGE_TITLE_KEYS = {
  overview: "hero.title",
  projects: "projects.title",
  quota: "kpi.weeklyQuota",
  conversations: "table.title",
  settings: "nav.settings",
};
const VIEW_KEY = "codex-usage-view";

function loadView() {
  const hash = location.hash.replace(/^#/, "").split("/")[0];
  if (PAGES.includes(hash)) return hash;
  try {
    const stored = localStorage.getItem(VIEW_KEY);
    if (PAGES.includes(stored)) return stored;
  } catch { /* Hash routing still works without storage. */ }
  return "overview";
}

const state = {
  data: null,
  dataMode: loadDataMode(),
  view: loadView(),
  period: "today",
  customRange: loadCustomRange(),
  query: "",
  projectQuery: "",
  selectedProject: null,
  model: "all",
  node: "all",
  folders: new Set(),
  usageThreshold: 0,
  page: 1,
  pageSize: 25,
  sortKey: "tokens",
  sortDirection: "desc",
  language: preferredLanguage(),
  pricing: loadPricing(),
  chartZoom: {},
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

function loadCustomRange() {
  try { return normalizeCustomRange(JSON.parse(localStorage.getItem(CUSTOM_RANGE_KEY))); }
  catch { return normalizeCustomRange(null); }
}

function saveCustomRange() {
  try { localStorage.setItem(CUSTOM_RANGE_KEY, JSON.stringify(state.customRange)); }
  catch { /* Custom filtering remains available for the current tab. */ }
}

function preferredLanguage() {
  let stored = null;
  try { stored = localStorage.getItem("codex-usage-language"); }
  catch { /* Browser language detection remains available without storage. */ }
  const browserLanguages = navigator.languages || [navigator.language];
  return resolveLanguage(stored ? [stored, ...browserLanguages] : browserLanguages);
}

function loadDataMode() {
  if (isHostedRuntime()) return runtimeCapabilities.defaultSource;
  try { return localStorage.getItem(DATA_MODE_KEY) === "centralized" ? "centralized" : "local"; }
  catch { return "local"; }
}

function usageCacheKey() {
  return state.dataMode === "centralized" ? CENTRALIZED_USAGE_CACHE_KEY : USAGE_CACHE_KEY;
}

function loadUsageCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(usageCacheKey()));
    if (!cached?.data?.sessions || !Number.isFinite(cached.savedAt)) return null;
    if (Date.now() - cached.savedAt > USAGE_CACHE_MAX_AGE_MS) return null;
    return cached.data;
  } catch { return null; }
}

function saveUsageCache(data) {
  try { localStorage.setItem(usageCacheKey(), JSON.stringify({ savedAt: Date.now(), data })); }
  catch { /* The dashboard still works when browser storage is unavailable or full. */ }
}

function dateRange() {
  return resolveDateRange(state.period, state.customRange);
}

function inRange(timestamp, range = dateRange()) {
  return timestampInRange(timestamp, range);
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

function apiCostSummaryMeta(summary, { includeContext = false, includeCoverage = false } = {}) {
  const parts = [];
  if (summary.fastCalls) parts.push(t("cost.fastUsage", { n: formatInt(summary.fastCalls), premium: formatCost(summary.fastPremiumCost) }));
  else parts.push(t("cost.standardTier"));
  if (summary.unsupportedFastCalls) parts.push(t("cost.fastUnavailable", { n: formatInt(summary.unsupportedFastCalls) }));
  if (includeCoverage && summary.estimatedCalls) parts.push(t("cost.referenceCoverage", { n: formatInt(summary.estimatedCalls) }));
  if (includeContext) {
    parts.push(summary.longContextCalls
      ? t("cost.longContext", { n: formatInt(summary.longContextCalls) })
      : t("cost.standardContext"));
  }
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
function projectName(session) { return projectIdentity(session, t("projects.unknown")).name; }

function projectGroups(sessions) {
  const groups = new Map();
  for (const session of sessions) {
    const identity = projectIdentity(session, t("projects.unknown"));
    const group = groups.get(identity.key) || { ...identity, paths: new Set(), sessions: [], calls: [] };
    group.paths.add(session.cwd || "");
    group.sessions.push(session);
    group.calls.push(...session.calls);
    groups.set(identity.key, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, paths: [...group.paths], cost: costOfCalls(group.calls) }))
    .sort((left, right) => right.cost.cost - left.cost.cost);
}

function sessionsInRange({ node = "all", folders = new Set(), model = "all", range = dateRange() } = {}) {
  if (!state.data) return [];
  return state.data.sessions.filter((session) => node === "all" || session.nodeId === node).map((session) => {
    if (folders.size && !folders.has(session.cwd || "")) return null;
    const calls = session.calls.filter((call) => inRange(call.timestamp, range) && (model === "all" || call.model === model));
    const turns = session.turns.filter((turn) => inRange(turn.startedAt, range) && (model === "all" || turn.model === model));
    return { ...session, calls, turns, usage: sumUsage(calls), modelCalls: calls.length, exchanges: turns.length, durationMs: turns.reduce((sum, turn) => sum + (turn.durationMs || 0), 0) };
  }).filter((session) => session?.calls.length);
}

function scopedSessions() {
  return sessionsInRange({ node: state.node, folders: state.folders, model: state.model });
}

function overviewSessions() {
  return sessionsInRange();
}

function weeklyRange(now = new Date()) {
  return resolveWeeklyRange(state.data?.weeklyQuota, now);
}

function allScopedCalls(sessions = scopedSessions()) { return sessions.flatMap((session) => session.calls); }

function modelGroups(calls) {
  const groups = new Map();
  for (const call of calls) {
    const model = call.model || t("detail.unknown");
    const group = groups.get(model) || { model, calls: [] };
    group.calls.push(call);
    groups.set(model, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, cost: costOfCalls(group.calls), tokens: sumUsage(group.calls).totalTokens }))
    .sort((left, right) => right.cost.cost - left.cost.cost);
}

function render() {
  syncPageChrome();
  const overview = overviewSessions();
  const overviewCalls = allScopedCalls(overview);
  const overviewUsage = sumUsage(overviewCalls);
  renderCostSummary(overviewCalls);
  renderKpis(overview, overviewCalls, overviewUsage);
  renderCostChart(overviewCalls, "#costChart");
  renderProjectRows("#overviewProjects", projectGroups(overview).slice(0, OVERVIEW_PROJECT_LIMIT), { navigate: true });
  renderRecentConversations(overview);
  renderProjectsPage(overview);
  renderQuotaPage();
  renderTable(scopedSessions());
  renderSettingsNodes();
  renderFreshness();
}

function renderCostSummary(calls) {
  const cost = costOfCalls(calls);
  const coverage = Math.round(cost.officialCoverage * 100);
  const coverageText = cost.estimatedCalls
    ? t("cost.referenceCoverage", { n: formatInt(cost.estimatedCalls) })
    : t("cost.officialCoverage", { n: coverage });
  const parts = [
    { key: "fresh", label: t("cost.fresh"), value: cost.freshInputCost },
    { key: "cached", label: t("cost.cached"), value: cost.cachedInputCost },
    { key: "output", label: t("cost.output"), value: cost.outputCost },
  ];
  $("#costSummary").innerHTML = `
    <div class="cost-topline"><p class="eyebrow">${t("cost.estimate")}</p><span class="cost-coverage">${escapeHtml(coverageText)}</span></div>
    <strong class="cost-value">${formatCost(cost.cost)}</strong>
    <p class="cost-caption">${escapeHtml(apiCostSummaryMeta(cost, { includeContext: true }))}</p>
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

function renderQuota() {
  renderQuotaNav();
  const target = $("#quotaHero");
  if (!target) return;
  const quota = state.data?.weeklyQuota;
  const available = quota && Number.isFinite(quota.remainingPercent);
  const label = `<span class="kpi-label">${t("kpi.weeklyQuota")}<b class="kpi-icon">%</b></span>`;
  if (!available) {
    target.innerHTML = `${label}<strong class="kpi-value">—</strong><span class="kpi-meta">${t("kpi.weeklyUnavailable")}</span>`;
    return;
  }
  const remaining = quota.remainingPercent;
  const resetAt = currentQuotaResetAt();
  const resetText = resetAt
    ? t("kpi.weeklyReset", { date: resetAt.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short" }) })
    : t("kpi.weeklyReset", { date: "—" });
  const resetsText = Number.isFinite(quota.resetsAvailable)
    ? t("kpi.resetsAvailable", { n: formatInt(quota.resetsAvailable) })
    : t("kpi.resetsUnknown");
  target.innerHTML = `${label}<strong class="kpi-value">${t("kpi.remaining", { n: new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(remaining) })}</strong><progress class="weekly-quota-bar${remaining < 20 ? " is-low" : ""}" max="100" value="${remaining}" aria-label="${escapeHtml(t("kpi.remaining", { n: remaining }))}"></progress><div class="weekly-quota-meta"><span class="quota-badge">${escapeHtml(resetText)}</span><span class="quota-badge">${escapeHtml(resetsText)}</span></div>`;
}

function currentQuotaResetAt() {
  const quota = state.data?.weeklyQuota;
  return weeklyRange().resetsAt || (quota?.resetsAt ? new Date(quota.resetsAt) : null);
}

function renderQuotaNav() {
  const quota = state.data?.weeklyQuota;
  const available = quota && Number.isFinite(quota.remainingPercent);
  const remainingText = available
    ? t("kpi.remaining", { n: new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(quota.remainingPercent) })
    : "—";
  const resetAt = available ? currentQuotaResetAt() : null;
  const resetText = resetAt ? resetAt.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" }) : "";
  $$("[data-quota-nav-remaining]").forEach((element) => { element.textContent = remainingText; });
  $$("[data-quota-nav-reset]").forEach((element) => { element.textContent = resetText; });
  $$('[data-nav-section="quota"]').forEach((link) => {
    const parts = [t("nav.quota")];
    if (available) parts.push(remainingText);
    if (resetText) parts.push(resetText);
    link.setAttribute("aria-label", parts.join(", "));
  });
}

function renderQuotaPage() {
  renderQuota();
  const sessions = sessionsInRange({ range: weeklyRange() });
  const calls = allScopedCalls(sessions);
  const usage = sumUsage(calls);
  const cost = costOfCalls(calls);
  const credits = codexCreditsOfCalls(calls);
  const cards = [
    [t("quota.weekCost"), formatCost(cost.cost), apiCostSummaryMeta(cost, { includeCoverage: true }), "$"],
    [t("quota.weekCredits"), formatCredits(credits.credits), creditSummaryMeta(credits), "◇"],
    [t("quota.weekTokens"), formatCompact(usage.totalTokens), `${formatInt(usage.totalTokens)} · ${t("kpi.cacheRate", { n: usage.inputTokens ? Math.round(usage.cachedInputTokens / usage.inputTokens * 100) : 0 })}`, "T"],
  ];
  $("#quotaKpis").innerHTML = cards.map(([label, value, meta, icon]) => `<article class="kpi"><span class="kpi-label">${label}<b class="kpi-icon">${icon}</b></span><strong class="kpi-value">${value}</strong><span class="kpi-meta" title="${escapeHtml(meta)}">${meta}</span></article>`).join("");
  renderCostChart(calls, "#quotaChart", "week");
  renderQuotaForecast();
}

function forecastPercent(value) {
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
}

function forecastDateLabel(value) {
  return new Intl.DateTimeFormat(locale(), { weekday: "short", day: "2-digit", hour: "2-digit" }).format(new Date(value));
}

function quotaForecastSamples(quota) {
  const sessions = (state.data?.sessions || []).filter((session) => !quota?.nodeId || session.nodeId === quota.nodeId);
  return sessions.flatMap((session) => session.calls.map((call) => ({
    timestamp: call.timestamp,
    value: codexCreditsOfCalls([call]).credits,
  })));
}

function quotaForecastSvg(forecast) {
  const width = Math.max(320, Math.round($("#quotaForecastChart")?.clientWidth || 760));
  const height = 260;
  const plot = { left: 62, right: 22, top: 18, bottom: 42 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const startTime = Date.parse(forecast.rangeStart);
  const endTime = Date.parse(forecast.rangeEnd);
  const maximumPercent = Math.max(100, forecast.expectedFinalPercent, ...forecast.actual.map((point) => point.percent));
  const yMaximum = Math.max(125, Math.ceil(maximumPercent * 1.08 / 25) * 25);
  const x = (timestamp) => plot.left + (Date.parse(timestamp) - startTime) / (endTime - startTime) * plotWidth;
  const y = (percent) => plot.top + (1 - percent / yMaximum) * plotHeight;
  const polyline = (points) => points.map((point) => `${x(point.timestamp).toFixed(2)},${y(point.percent).toFixed(2)}`).join(" ");
  const yTicks = Array.from({ length: 6 }, (_, index) => index * yMaximum / 5);
  const xTicks = weeklyForecastTicks(startTime, endTime);
  const limitY = y(100);
  const observedX = x(forecast.observedAt);
  const actualPoint = forecast.actual.at(-1);
  const projectedPoint = forecast.projected.at(-1);
  const dangerClass = forecast.expectedFinalPercent > 100 ? " is-over" : "";
  const grid = yTicks.map((tick) => `<g class="quota-axis-grid"><line x1="${plot.left}" y1="${y(tick)}" x2="${width - plot.right}" y2="${y(tick)}"></line><text x="${plot.left - 10}" y="${y(tick) + 4}" text-anchor="end">${escapeHtml(forecastPercent(tick))} %</text></g>`).join("");
  const timeTicks = xTicks.map((tick, index) => `<g class="quota-axis-time${index > 0 && index < xTicks.length - 1 ? " is-minor" : ""}"><line x1="${x(new Date(tick).toISOString())}" y1="${plot.top}" x2="${x(new Date(tick).toISOString())}" y2="${height - plot.bottom}"></line><text x="${x(new Date(tick).toISOString())}" y="${height - 14}" text-anchor="${index === 0 ? "start" : index === xTicks.length - 1 ? "end" : "middle"}">${escapeHtml(forecastDateLabel(tick))}</text></g>`).join("");
  return `<svg class="quota-forecast-svg" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="quotaForecastSvgTitle quotaForecastSvgDescription">
    <title id="quotaForecastSvgTitle">${escapeHtml(t("quota.forecastAria"))}</title>
    <desc id="quotaForecastSvgDescription">${escapeHtml(t(forecast.marginPercent >= 0 ? "quota.margin" : "quota.overrun", { n: forecastPercent(Math.abs(forecast.marginPercent)) }))}</desc>
    ${grid}${timeTicks}
    <line class="quota-limit-line" x1="${plot.left}" y1="${limitY}" x2="${width - plot.right}" y2="${limitY}"></line>
    <text class="quota-limit-label" x="${width - plot.right - 4}" y="${limitY - 7}" text-anchor="end">${escapeHtml(t("quota.limit"))}</text>
    <line class="quota-observed-line" x1="${observedX}" y1="${plot.top}" x2="${observedX}" y2="${height - plot.bottom}"></line>
    <text class="quota-observed-label" x="${Math.min(width - plot.right - 4, observedX + 7)}" y="${plot.top + 13}">${escapeHtml(t("quota.observed"))}</text>
    <polyline class="quota-actual-line" points="${polyline(forecast.actual)}"></polyline>
    <polyline class="quota-projected-line${dangerClass}" points="${polyline(forecast.projected)}"></polyline>
    <circle class="quota-actual-point" cx="${x(actualPoint.timestamp)}" cy="${y(actualPoint.percent)}" r="4"><title>${escapeHtml(`${t("quota.actual")} · ${forecastPercent(actualPoint.percent)} %`)}</title></circle>
    <circle class="quota-projected-point${dangerClass}" cx="${x(projectedPoint.timestamp)}" cy="${y(projectedPoint.percent)}" r="5"><title>${escapeHtml(`${t("quota.forecastAtReset")} · ${forecastPercent(projectedPoint.percent)} %`)}</title></circle>
    <text class="quota-endpoint-label${dangerClass}" x="${x(projectedPoint.timestamp) - 8}" y="${Math.max(plot.top + 14, y(projectedPoint.percent) - 10)}" text-anchor="end">${escapeHtml(`${forecastPercent(projectedPoint.percent)} %`)}</text>
    <text class="quota-window-label" x="${plot.left}" y="${height - 28}" text-anchor="start">${escapeHtml(t("quota.renew"))}</text>
    <text class="quota-window-label" x="${width - plot.right}" y="${height - 28}" text-anchor="end">${escapeHtml(t("quota.reset"))}</text>
  </svg>`;
}

function renderQuotaForecast() {
  const summary = $("#quotaForecastSummary");
  const chart = $("#quotaForecastChart");
  if (!summary || !chart) return;
  const quota = state.data?.weeklyQuota;
  const range = weeklyRange();
  if (!quota || !Number.isFinite(quota.usedPercent) || !range.resetsAt) {
    summary.innerHTML = "";
    chart.innerHTML = `<p class="quota-forecast-empty">${t("quota.unavailable")}</p>`;
    return;
  }
  const forecast = buildQuotaForecast({
    samples: quotaForecastSamples(quota),
    rangeStart: range.start,
    rangeEnd: range.resetsAt,
    observedAt: quota.observedAt || new Date(),
    usedPercent: quota.usedPercent,
  });
  if (forecast.status !== "ready") {
    summary.innerHTML = "";
    chart.innerHTML = `<p class="quota-forecast-empty">${t(forecast.status === "unavailable" ? "quota.unavailable" : "quota.insufficient")}</p>`;
    return;
  }
  const over = forecast.marginPercent < 0;
  const outcome = t(over ? "quota.overrun" : "quota.margin", { n: forecastPercent(Math.abs(forecast.marginPercent)) });
  summary.innerHTML = `
    <article class="forecast-stat forecast-outcome${over ? " is-over" : " is-safe"}"><span>${t("quota.forecastAtReset")}</span><strong>${forecastPercent(forecast.expectedFinalPercent)} %</strong><small>${escapeHtml(outcome)}</small></article>
    <article class="forecast-stat"><span>${t("quota.emaHour")}</span><strong>${formatCredits(forecast.creditsPerHour)}</strong><small>${t("quota.forecastHint")}</small></article>
    <article class="forecast-stat"><span>${t("quota.emaDay")}</span><strong>${formatCredits(forecast.creditsPerDay)}</strong><small>${t("quota.forecastHint")}</small></article>`;
  chart.innerHTML = quotaForecastSvg(forecast);
}

function isSelectedProject(group) {
  return Boolean(state.selectedProject && state.selectedProject.key === group.key);
}

function selectProject(group) {
  state.selectedProject = isSelectedProject(group) ? null : { key: group.key, name: group.name, paths: group.paths };
}

function renderProjectRows(selector, groups, { navigate = false } = {}) {
  const target = $(selector);
  if (!target) return;
  const total = groups.reduce((sum, group) => sum + group.cost.cost, 0);
  const max = Math.max(0.0001, ...groups.map((group) => group.cost.cost));
  if (!groups.length) {
    target.innerHTML = `<div class="project-empty">${t("projects.none")}</div>`;
    return;
  }
  target.innerHTML = groups.map((group, index) => {
    const active = isSelectedProject(group);
    const share = total ? group.cost.cost / total * 100 : 0;
    const tokens = sumUsage(group.calls).totalTokens;
    return `<button class="project-row${active ? " active" : ""}" type="button" data-project-index="${index}" aria-pressed="${active}" aria-label="${escapeHtml(t("projects.filter", { name: group.name }))}"><span class="project-name">${escapeHtml(group.name)}</span><span class="project-value">${formatCost(group.cost.cost)}</span><span class="project-meta">${formatInt(group.sessions.length)} · ${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(share)} % · ${formatCompact(tokens)}</span><progress class="project-bar" max="${max}" value="${group.cost.cost}" aria-label="${escapeHtml(group.name)}"></progress></button>`;
  }).join("");
  $$(`${selector} .project-row`).forEach((row) => row.addEventListener("click", () => {
    selectProject(groups[Number(row.dataset.projectIndex)]);
    if (navigate) showPage("projects");
    else render();
  }));
}

function renderProjectsPage(periodSessions) {
  const query = normalizeSearch(state.projectQuery);
  const groups = projectGroups(periodSessions).filter((group) => !query || normalizeSearch(group.name).includes(query));
  renderProjectRows("#projectList", groups);
  const selected = groups.find((group) => isSelectedProject(group)) || (query ? null : projectGroups(periodSessions).find((group) => isSelectedProject(group)));
  renderProjectDetail(selected);
}

function renderProjectDetail(group) {
  const target = $("#projectDetail");
  if (!group) {
    target.innerHTML = `<div class="project-detail-empty">${t("projects.select")}</div>`;
    return;
  }
  const usage = sumUsage(group.calls);
  const credits = codexCreditsOfCalls(group.calls);
  const models = modelGroups(group.calls);
  const maxCost = Math.max(0.0001, ...models.map((item) => item.cost.cost));
  const recent = [...group.sessions].sort((left, right) => Date.parse(latestTimestamp(right.calls)) - Date.parse(latestTimestamp(left.calls))).slice(0, 6);
  const modelMarkup = models.map((item) => `<div class="model-row"><div class="model-row-head"><strong>${escapeHtml(item.model)}</strong><span>${formatCost(item.cost.cost)} · ${formatCompact(item.tokens)}</span></div><progress class="project-bar" max="${maxCost}" value="${item.cost.cost}" aria-label="${escapeHtml(item.model)}"></progress></div>`).join("") || `<p class="kpi-meta">${t("projects.none")}</p>`;
  target.innerHTML = `
    <div><p class="eyebrow">${t("projects.label")}</p><h2>${escapeHtml(group.name)}</h2></div>
    <div class="project-detail-kpis">
      <div class="detail-kpi"><span>${t("table.cost")}</span><strong class="cost">${formatCost(group.cost.cost)}</strong></div>
      <div class="detail-kpi"><span>${t("kpi.credits")}</span><strong class="credits">${formatCredits(credits.credits)}</strong></div>
      <div class="detail-kpi"><span>${t("table.tokens")}</span><strong>${formatCompact(usage.totalTokens)}</strong></div>
    </div>
    <section><h3 class="eyebrow">${t("projects.models")}</h3><div class="model-breakdown">${modelMarkup}</div></section>
    <section><h3 class="eyebrow">${t("overview.recent")}</h3><div class="recent-list">${recentConversationMarkup(recent)}</div></section>
    <button type="button" class="primary-button" id="openProjectConversations">${t("projects.openConversations")}</button>`;
  bindRecentConversationClicks(target);
  $("#openProjectConversations")?.addEventListener("click", () => {
    state.folders = new Set(group.paths);
    state.page = 1;
    $$("#folderFilterOptions input").forEach((input) => { input.checked = state.folders.has(input.value); });
    updateFolderFilterSummary();
    showPage("conversations");
  });
}

function recentConversationMarkup(sessions) {
  if (!sessions.length) return `<p class="project-empty">${t("conversation.none")}</p>`;
  return sessions.map((session) => {
    const lastCall = latestTimestamp(session.calls);
    const cost = costOfCalls(session.calls);
    return `<button class="recent-item" type="button" data-session-id="${escapeHtml(session.id)}"><div class="recent-item-top"><span class="recent-title">${escapeHtml(sessionTitle(session))}</span><span class="cost">${formatCost(cost.cost)}</span></div><div class="recent-meta">${escapeHtml(session.nodeAlias || t("node.local"))} · ${formatDate(new Date(lastCall))} · ${formatCompact(session.usage.totalTokens)}</div></button>`;
  }).join("");
}

function bindRecentConversationClicks(root = document) {
  root.querySelectorAll(".recent-item[data-session-id]").forEach((row) => {
    row.addEventListener("click", () => openDrawer(row.dataset.sessionId));
  });
}

function renderRecentConversations(sessions) {
  const recent = [...sessions].sort((left, right) => Date.parse(latestTimestamp(right.calls)) - Date.parse(latestTimestamp(left.calls))).slice(0, 6);
  $("#recentConversations").innerHTML = recentConversationMarkup(recent);
  bindRecentConversationClicks($("#recentConversations"));
}

function renderSettingsNodes() {
  const nodes = (state.data?.nodes || []).filter((node) => !node.revokedAt);
  const target = $("#settingsNodes");
  if (!nodes.length) {
    target.innerHTML = `<p class="kpi-meta">${t("settings.noMachines")}</p>`;
    return;
  }
  target.innerHTML = `<div class="node-list">${nodes.map((node) => `<article class="node-row"><span class="node-pill">${escapeHtml(node.alias)}</span></article>`).join("")}</div>`;
}

function bucketsFor(calls, period = state.period) {
  if (period === "custom" || period === "week") return customBucketsFor(calls, period === "week" ? weeklyRange() : dateRange());
  const byHour = period === "today";
  const byMonth = period === "all";
  const count = byHour ? 24 : period === "7d" ? 7 : period === "30d" ? 30 : 12;
  const buckets = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(now);
    if (byHour) { start.setHours(now.getHours() - i, 0, 0, 0); }
    else if (byMonth) { start.setMonth(now.getMonth() - i, 1); start.setHours(0, 0, 0, 0); }
    else { start.setDate(now.getDate() - i); start.setHours(0, 0, 0, 0); }
    const end = new Date(start);
    if (byHour) end.setHours(end.getHours() + 1); else if (byMonth) end.setMonth(end.getMonth() + 1); else end.setDate(end.getDate() + 1);
    buckets.push({ start, end, label: byHour ? `${String(start.getHours()).padStart(2, "0")}h` : byMonth ? start.toLocaleDateString(locale(), { month: "short" }) : start.toLocaleDateString(locale(), { day: "2-digit", month: count > 7 ? "2-digit" : "short" }), granularity: byHour ? "hour" : byMonth ? "month" : "day", calls: [] });
  }
  for (const call of calls) {
    const time = Date.parse(call.timestamp); const bucket = buckets.find((item) => time >= item.start && time < item.end); if (bucket) bucket.calls.push(call);
  }
  return buckets;
}

function customBucketsFor(calls, range = dateRange()) {
  const rangeEnd = range.end || new Date();
  const span = Math.max(60_000, rangeEnd.getTime() - range.start.getTime());
  const hour = 60 * 60 * 1_000;
  const day = 24 * hour;
  const count = span <= 48 * hour ? Math.min(48, Math.max(1, Math.ceil(span / hour)))
    : span <= 45 * day ? Math.min(45, Math.max(1, Math.ceil(span / day)))
      : 12;
  const interval = span / count;
  const buckets = Array.from({ length: count }, (_, index) => {
    const start = new Date(range.start.getTime() + interval * index);
    const end = new Date(index === count - 1 ? rangeEnd : range.start.getTime() + interval * (index + 1));
    const label = span <= 48 * hour
      ? start.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })
      : start.toLocaleDateString(locale(), { day: "2-digit", month: span <= 370 * day ? "short" : "2-digit", year: span > 370 * day ? "2-digit" : undefined });
    return { start, end, label, granularity: span <= 48 * hour ? "hour" : span <= 45 * day ? "day" : null, calls: [] };
  });
  for (const call of calls) {
    const time = Date.parse(call.timestamp);
    const bucket = buckets.find((item, index) => time >= item.start && (time < item.end || (index === buckets.length - 1 && time <= item.end)));
    if (bucket) bucket.calls.push(call);
  }
  return buckets;
}

function renderCostChart(calls, target = "#costChart", period = state.period) {
  const host = $(target);
  if (!host) return;
  const zoomStack = state.chartZoom[target] || [];
  const zoom = zoomStack.at(-1);
  const sourceBuckets = zoom
    ? chartDrilldownBuckets(calls, zoom, zoom.granularity, locale())
    : bucketsFor(calls, period);
  const buckets = sourceBuckets.map((bucket) => ({ ...bucket, cost: costOfCalls(bucket.calls) }));
  const max = Math.max(0.0001, ...buckets.map((bucket) => bucket.cost.cost));
  const context = zoom ? chartZoomContext(zoom) : "";
  const toolbar = zoom ? `<div class="chart-zoom-toolbar"><button type="button" class="chart-zoom-back">← ${escapeHtml(t("chart.zoomBack"))}</button><strong>${escapeHtml(context)}</strong></div>` : "";
  host.innerHTML = toolbar + buckets.map((bucket, index) => {
    const segments = stackedChartSegments([
      { key: "fresh", value: bucket.cost.freshInputCost },
      { key: "cached", value: bucket.cost.cachedInputCost },
      { key: "output", value: bucket.cost.outputCost },
    ], max);
    const showLabel = buckets.length <= 12 || index % Math.ceil(buckets.length / 8) === 0;
    const detail = `${bucket.label} · ${formatCost(bucket.cost.cost)}`;
    const drillable = Boolean(nextChartGranularity(bucket.granularity));
    const drillLabel = t("chart.zoomInto", { label: bucket.label });
    const rectangles = segments
      .filter((segment) => segment.height > 0)
      .map((segment) => `<rect class="chart-segment ${segment.key}" x="0" y="${segment.y}" width="30" height="${segment.height}"></rect>`)
      .join("");
    return `<div class="chart-column${drillable ? " is-drillable" : ""}" data-bucket-index="${index}" data-tip="${escapeHtml(detail)}" aria-label="${escapeHtml(drillable ? `${detail}. ${drillLabel}` : detail)}"${drillable ? ' role="button"' : ""} tabindex="0"><svg class="chart-stack" viewBox="0 0 30 205" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rectangles}</svg><label>${showLabel ? escapeHtml(bucket.label) : ""}</label></div>`;
  }).join("");

  const drillInto = (column) => {
    const bucket = buckets[Number(column.dataset.bucketIndex)];
    const granularity = nextChartGranularity(bucket?.granularity);
    if (!bucket || !granularity) return;
    state.chartZoom[target] = [...zoomStack, { start: bucket.start, end: bucket.end, granularity }];
    renderCostChart(calls, target, period);
  };
  host.querySelectorAll(".chart-column.is-drillable").forEach((column) => {
    column.addEventListener("click", () => drillInto(column));
    column.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      drillInto(column);
    });
  });
  host.querySelector(".chart-zoom-back")?.addEventListener("click", () => {
    const nextStack = zoomStack.slice(0, -1);
    if (nextStack.length) state.chartZoom[target] = nextStack;
    else delete state.chartZoom[target];
    renderCostChart(calls, target, period);
  });
}

function chartZoomContext(zoom) {
  const start = new Date(zoom.start);
  return zoom.granularity === "day"
    ? start.toLocaleDateString(locale(), { month: "long", year: "numeric" })
    : start.toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long", year: "numeric" });
}

function renderTable(sessions) {
  const query = normalizeSearch(state.query);
  const prepared = sessions.map((session) => ({
    ...session,
    tableNode: session.nodeAlias || t("node.local"),
    tableProject: projectName(session),
    tableModel: [...new Set(session.calls.map((call) => call.model))].join(", ") || session.models.join(", ") || "unknown",
    tableProfiles: usageProfilesOfCalls(session.calls),
    tableCost: costOfCalls(session.calls),
    tableCredits: codexCreditsOfCalls(session.calls),
    tableLastCall: latestTimestamp(session.calls),
  }));
  const filtered = prepared.filter((session) => {
    const profileSearch = session.tableProfiles.map((profile) => `${profile.model} ${effortLabel(profile.effort)} ${profile.fast ? "fast" : "standard"}`).join(" ");
    const haystack = normalizeSearch(`${sessionTitle(session)} ${session.tableNode} ${session.tableModel} ${profileSearch} ${session.cwd || ""}`);
    return session.usage.totalTokens >= state.usageThreshold && (!query || haystack.includes(query));
  });
  filtered.sort((left, right) => compareSessions(left, right) * (state.sortDirection === "asc" ? 1 : -1));

  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(Math.max(1, state.page), totalPages);
  const startIndex = (state.page - 1) * state.pageSize;
  const visible = filtered.slice(startIndex, startIndex + state.pageSize);
  $("#conversationRows").innerHTML = visible.length ? visible.map((session) =>
    `<tr data-session-id="${escapeHtml(session.id)}" tabindex="0"><td><div class="conversation-name">${escapeHtml(sessionTitle(session))}</div><div class="conversation-date">${formatInt(session.exchanges)} ${session.exchanges === 1 ? t("table.exchange") : t("table.exchanges").toLocaleLowerCase(locale())} · ${formatDuration(session.durationMs)}</div></td><td><span class="node-pill">${escapeHtml(session.tableNode)}</span></td><td><span class="project-pill" title="${escapeHtml(session.cwd || session.tableProject)}">${escapeHtml(session.tableProject)}</span></td><td>${usageProfilesMarkup(session.calls, { limit: 2, compact: true })}</td><td class="last-call"><time datetime="${escapeHtml(session.tableLastCall)}">${formatDate(new Date(session.tableLastCall))}</time></td><td>${formatInt(session.modelCalls)}</td><td title="${formatInt(session.usage.totalTokens)} ${t("units.tokens")}">${formatCompact(session.usage.totalTokens)}</td><td><div class="cost-stack"><strong>${formatCost(session.tableCost.cost)}${session.tableCost.estimatedCalls ? " ≈" : ""}</strong><span>${formatCredits(session.tableCredits.credits)} Codex</span></div></td></tr>`
  ).join("") : `<tr><td colspan="8" class="empty">${t("conversation.none")}</td></tr>`;
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
    node: [left.tableNode, right.tableNode],
    project: [left.tableProject, right.tableProject],
    model: [left.tableModel, right.tableModel],
    lastCall: [Date.parse(left.tableLastCall) || 0, Date.parse(right.tableLastCall) || 0],
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
  const session = overviewSessions().find((item) => item.id === id) || scopedSessions().find((item) => item.id === id); if (!session) return;
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
      <div class="detail-kpi"><span>${t("detail.cost")}</span><strong class="cost">${formatCost(cost.cost)}</strong><small>${apiCostSummaryMeta(cost, { includeCoverage: true })}</small></div>
      <div class="detail-kpi"><span>${t("detail.credits")}</span><strong class="credits">${formatCredits(credits.credits)}</strong><small>${creditSummaryMeta(credits)}</small></div>
      <div class="detail-kpi"><span>${t("table.tokens")}</span><strong>${formatCompact(usage.totalTokens)}</strong><small>${formatInt(usage.totalTokens)}</small></div>
      <div class="detail-kpi"><span>${t("detail.calls")}</span><strong>${session.modelCalls}</strong></div>
      <div class="detail-kpi"><span>${t("detail.exchanges")}</span><strong>${session.exchanges}</strong></div>
      <div class="detail-kpi"><span>${t("detail.cache")}</span><strong>${usage.inputTokens ? Math.round(usage.cachedInputTokens / usage.inputTokens * 100) : 0} %</strong></div>
      <div class="detail-kpi"><span>${t("detail.duration")}</span><strong>${formatDuration(session.durationMs)}</strong></div>
    </div>
    <div class="detail-section"><h3>${t("detail.periodExchanges")}</h3>${turns}</div>
    <div class="detail-section"><h3>${t("detail.node")}</h3><div class="path-box">${escapeHtml(session.nodeAlias || t("node.local"))}</div></div>
    <div class="detail-section"><h3>${t("detail.cwd")}</h3><div class="path-box">${escapeHtml(session.cwd || t("detail.unknown"))}</div></div>
    <div class="detail-section"><h3>${t("detail.id")}</h3><div class="path-box">${escapeHtml(session.id)}</div></div>`;
  $("#detailDrawer").setAttribute("aria-hidden", "false"); document.body.classList.add("drawer-open");
}

function renderFreshness() {
  if (state.view === "quota") {
    const range = weeklyRange();
    const options = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
    $("#periodLabel").textContent = t("period.customLabel", {
      start: range.start.toLocaleString(locale(), options),
      end: range.resetsAt ? range.resetsAt.toLocaleString(locale(), options) : t("period.now"),
    });
  } else if (state.view === "settings") {
    $("#periodLabel").textContent = t("nav.settings");
  } else if (state.period === "custom") {
    const range = dateRange();
    const options = { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" };
    $("#periodLabel").textContent = t("period.customLabel", {
      start: range.start.toLocaleString(locale(), options),
      end: range.end ? range.end.toLocaleString(locale(), options) : t("period.now"),
    });
  } else {
    $("#periodLabel").textContent = t(`period.${state.period}Label`);
  }
  if (state.data) {
    const time = new Date(state.data.generatedAt).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const mesh = state.data.source?.mode === "mesh";
    $$(".privacy-copy").forEach((element) => { element.textContent = t(mesh ? "hero.privacyMesh" : "hero.privacy"); });
    $("#freshness").textContent = mesh
      ? t("freshness.mesh", { n: state.data.sessions.length, nodes: (state.data.nodes || []).filter((node) => !node.revokedAt).length, time })
      : t("freshness", { n: state.data.sessions.length, time });
  }
}

function populateNodes() {
  const nodes = (state.data.nodes || []).filter((node) => !node.revokedAt).sort((left, right) => left.alias.localeCompare(right.alias, locale(), { sensitivity: "base" }));
  if (state.node !== "all" && !nodes.some((node) => node.id === state.node)) state.node = "all";
  $("#nodeFilter").innerHTML = `<option value="all">${t("node.all")}</option>${nodes.map((node) => `<option value="${escapeHtml(node.id)}">${escapeHtml(node.alias)}</option>`).join("")}`;
  $("#nodeFilter").value = state.node;
  $("#nodeFilter").hidden = nodes.length === 0;
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
  if (!state.data) return;
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
  populateNodes();
  populateModels();
  populateFolders();
  render();
}

let dataRequest = null;
let dataModeRequest = Promise.resolve();

async function loadData(force = false, silent = false) {
  if (!force && !state.data) {
    const cachedData = loadUsageCache();
    if (cachedData) applyUsageData(cachedData);
  }
  if (dataRequest) return dataRequest;
  if (!silent) $("#refreshButton").classList.add("loading");
  dataRequest = (async () => {
  try {
    const parameters = new URLSearchParams({ source: state.dataMode });
    if (force) parameters.set("refresh", "1");
    const response = await fetch(`/api/usage?${parameters}`);
    if (!response.ok) {
      let details = null;
      try { details = await response.json(); } catch { /* Fall back to the HTTP status. */ }
      throw new Error(details?.error || `HTTP ${response.status}`);
    }
    applyUsageData(await response.json());
    if (force) toast(t(state.dataMode === "centralized" ? "refresh.doneCentralized" : "refresh.done"));
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
  document.title = isHostedRuntime() ? "Codex Usage Mesh" : t("app.title");
  if (isHostedRuntime()) {
    $(".brand strong").textContent = "Codex Usage Mesh";
    $('[data-i18n="brand.tagline"]').dataset.i18n = "brand.taglineHosted";
    $('[data-i18n="license.independent"]').dataset.i18n = "license.independentHosted";
  }
  $("#languageSelect").value = state.language;
  $$('[data-i18n]').forEach((element) => { element.textContent = t(element.dataset.i18n); });
  $$('[data-i18n-placeholder]').forEach((element) => { element.placeholder = t(element.dataset.i18nPlaceholder); });
  $$('[data-i18n-aria]').forEach((element) => { element.setAttribute("aria-label", t(element.dataset.i18nAria)); });
  $("#pricingButton").title = t("action.pricing");
  $("#pricingButton").setAttribute("aria-label", t("action.pricing"));
  $("#modelFilter").setAttribute("aria-label", t("filter.model"));
  $("#nodeFilter").setAttribute("aria-label", t("filter.node"));
  $("#usageFilter").setAttribute("aria-label", t("filter.usage"));
  syncDataModeControls();
  updateFolderFilterSummary();
  $("#searchInput").setAttribute("aria-label", t("search.aria"));
  $("#projectSearch")?.setAttribute("aria-label", t("search.projects"));
  if (!state.data && state.dataMode === "centralized") $("#freshness").textContent = t("load.loadingCentralized");
  syncPageChrome();
  renderQuota();
}

function syncDataModeControls() {
  $$('[data-data-mode]').forEach((button) => {
    const supported = runtimeCapabilities.sources.includes(button.dataset.dataMode);
    const active = button.dataset.dataMode === state.dataMode;
    button.hidden = !supported;
    button.disabled = !supported;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function setDataMode(mode) {
  dataModeRequest = dataModeRequest.then(() => runSetDataMode(mode));
  return dataModeRequest;
}

async function runSetDataMode(mode) {
  if (!runtimeCapabilities.sources.includes(mode) || mode === state.dataMode) return;
  if (dataRequest) await dataRequest;
  state.dataMode = mode;
  try { localStorage.setItem(DATA_MODE_KEY, mode); } catch { /* The selection remains active for this tab. */ }
  state.data = null;
  state.node = "all";
  state.page = 1;
  syncDataModeControls();
  $("#freshness").textContent = t(mode === "centralized" ? "load.loadingCentralized" : "load.loading");
  await loadData();
}

function syncCustomRangeControls() {
  $("#customStart").value = state.customRange.start;
  $("#customEndNow").checked = state.customRange.end === null;
  $("#customEnd").disabled = state.customRange.end === null;
  $("#customEnd").value = state.customRange.end || "";
  $("#customEnd").min = state.customRange.start;
}

function setCustomPanel(open) {
  $("#customRangePanel").hidden = !open;
  $("#customPeriodButton").setAttribute("aria-expanded", String(open));
}

function commitCustomRange() {
  const start = $("#customStart").value;
  if (!start) return;
  let end = $("#customEndNow").checked ? null : $("#customEnd").value || toDateTimeLocalValue(new Date());
  if (end && Date.parse(end) < Date.parse(start)) end = start;
  state.customRange = normalizeCustomRange({ start, end });
  saveCustomRange();
  syncCustomRangeControls();
  if (state.period === "custom") { state.page = 1; render(); }
}

$$('[data-period]').forEach((button) => button.addEventListener("click", () => {
  const period = button.dataset.period;
  const togglePanel = period === "custom" && state.period === "custom" && !$("#customRangePanel").hidden;
  $$('[data-period]').forEach((item) => item.classList.toggle("active", item === button));
  state.period = period;
  state.chartZoom = {};
  state.page = 1;
  if (period === "custom") syncCustomRangeControls();
  setCustomPanel(period === "custom" && !togglePanel);
  render();
}));
$$('[data-data-mode]').forEach((button) => button.addEventListener("click", () => { void setDataMode(button.dataset.dataMode); }));
$("#customStart").addEventListener("change", commitCustomRange);
$("#customEnd").addEventListener("change", commitCustomRange);
$("#customEndNow").addEventListener("change", () => {
  if (!$("#customEndNow").checked && !$("#customEnd").value) $("#customEnd").value = toDateTimeLocalValue(new Date());
  commitCustomRange();
});
$("#modelFilter").addEventListener("change", (event) => { state.model = event.target.value; state.page = 1; render(); });
$("#nodeFilter").addEventListener("change", (event) => { state.node = event.target.value; state.page = 1; render(); });
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
  else { state.sortKey = key; state.sortDirection = ["title", "node", "project", "model"].includes(key) ? "asc" : "desc"; }
  state.page = 1;
  renderTable(scopedSessions());
}));
$("#resetTableFilters").addEventListener("click", () => {
  state.query = "";
  state.model = "all";
  state.node = "all";
  state.folders.clear();
  state.usageThreshold = 0;
  state.sortKey = "tokens";
  state.sortDirection = "desc";
  state.page = 1;
  $("#searchInput").value = "";
  $("#modelFilter").value = "all";
  $("#nodeFilter").value = "all";
  $("#usageFilter").value = "0";
  $$("#folderFilterOptions input").forEach((input) => { input.checked = false; });
  updateFolderFilterSummary();
  render();
});
$("#languageSelect").addEventListener("change", (event) => {
  state.language = event.target.value;
  localStorage.setItem("codex-usage-language", state.language);
  applyTranslations();
  if (state.data) { populateNodes(); populateModels(); populateFolders(); render(); }
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
$("#projectSearch").addEventListener("input", (event) => { state.projectQuery = event.target.value; if (state.data) renderProjectsPage(overviewSessions()); });
$("#settingsPricingButton").addEventListener("click", openPricing);

function setActiveNav(section) {
  $$("[data-nav-section]").forEach((item) => {
    item.classList.toggle("active", item.dataset.navSection === section);
  });
}

function syncPageChrome() {
  const page = state.view;
  document.body.dataset.page = page;
  $$(".page").forEach((section) => { section.hidden = section.dataset.page !== page; });
  setActiveNav(page);
  const title = $("#pageTitle");
  if (title) title.textContent = t(PAGE_TITLE_KEYS[page]);
}

function showPage(page, { updateHash = true } = {}) {
  if (!PAGES.includes(page)) page = "overview";
  state.view = page;
  try { localStorage.setItem(VIEW_KEY, page); } catch { /* Hash routing remains available. */ }
  if (updateHash) {
    const hash = `#${page}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
  if (state.data) render();
  else { syncPageChrome(); renderFreshness(); }
}

window.addEventListener("hashchange", () => {
  const page = PAGES.includes(location.hash.replace(/^#/, "")) ? location.hash.replace(/^#/, "") : "overview";
  if (page === state.view) {
    syncPageChrome();
    return;
  }
  showPage(page, { updateHash: false });
});

let quotaForecastResizeTimer = null;
window.addEventListener("resize", () => {
  clearTimeout(quotaForecastResizeTimer);
  quotaForecastResizeTimer = setTimeout(() => {
    if (state.data && state.view === "quota") renderQuotaForecast();
  }, 120);
});

async function loadRuntimeCapabilities() {
  try {
    const response = await fetch("/api/capabilities", { cache: "no-store" });
    if (!response.ok) return;
    const capabilities = await response.json();
    if (capabilities?.apiVersion !== 1
      || !Array.isArray(capabilities.sources)
      || !capabilities.sources.includes(capabilities.defaultSource)) return;
    runtimeCapabilities = capabilities;
  } catch { /* Keep the URL-derived compatibility mode with an older server. */ }

  if (!runtimeCapabilities.sources.includes(state.dataMode) || isHostedRuntime()) {
    state.dataMode = runtimeCapabilities.defaultSource;
  }
  if (isHostedRuntime()) document.documentElement.dataset.hosted = "true";
  else delete document.documentElement.dataset.hosted;
}

async function initializeDashboard() {
  await loadRuntimeCapabilities();
  applyTranslations();
  syncCustomRangeControls();
  if (location.hash.replace(/^#/, "") !== state.view) history.replaceState(null, "", `#${state.view}`);
  syncPageChrome();
  await loadData();
}

void initializeDashboard();
setInterval(() => {
  if (!document.hidden) void pollForNewData();
}, POLL_INTERVAL_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) void pollForNewData();
});

let pollRequest = null;
let lastCentralizedPollAt = 0;

async function pollForNewData() {
  if (!state.data || pollRequest) return;
  pollRequest = (async () => {
    try {
      if (state.dataMode === "centralized") {
        if (Date.now() - lastCentralizedPollAt < CENTRALIZED_POLL_INTERVAL_MS) return;
        lastCentralizedPollAt = Date.now();
        await loadData(false, true);
        return;
      }
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
