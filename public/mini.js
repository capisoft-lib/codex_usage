import { LOCALE_TAGS, resolveLanguage } from "./translations.js";
import { weeklyQuotaPeriods, shortQuotaDisplay, quotaCountdownText, normalizeTimeFormat, timeFormatOptions } from "./quota-display.js";
import { createMiniData, selectMiniSource } from "./mini-data.js";

const params = new URLSearchParams(location.search);
const stored = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
let language = resolveLanguage(params.get("language") || stored("codex-usage-language") || navigator.language) || "en";
let timeFormat = normalizeTimeFormat(params.get("timeFormat") || stored("codex-usage-time-format"));
const messages = {
  en: { fiveHour: "5 hours", weekly: "Weekly", loading: "Loading…", offline: "Connection lost", updated: "Checked", observed: "Observed", waiting: "Awaiting observation", local: "Local", centralized: "Centralized", remaining: "remaining" },
  fr: { fiveHour: "5 heures", weekly: "Hebdomadaire", loading: "Chargement…", offline: "Connexion perdue", updated: "Vérifié", observed: "Observé", waiting: "En attente d’observation", local: "Local", centralized: "Centralisé", remaining: "restant" },
  de: { fiveHour: "5 Stunden", weekly: "Wöchentlich", loading: "Laden…", offline: "Verbindung verloren", updated: "Geprüft", observed: "Beobachtet", waiting: "Warte auf Beobachtung", local: "Lokal", centralized: "Zentral", remaining: "verbleibend" },
  es: { fiveHour: "5 horas", weekly: "Semanal", loading: "Cargando…", offline: "Conexión perdida", updated: "Comprobado", observed: "Observado", waiting: "Esperando observación", local: "Local", centralized: "Centralizado", remaining: "restante" },
  it: { fiveHour: "5 ore", weekly: "Settimanale", loading: "Caricamento…", offline: "Connessione persa", updated: "Verificato", observed: "Osservato", waiting: "In attesa di osservazione", local: "Locale", centralized: "Centralizzato", remaining: "rimanente" },
  pt: { fiveHour: "5 horas", weekly: "Semanal", loading: "A carregar…", offline: "Ligação perdida", updated: "Verificado", observed: "Observado", waiting: "A aguardar observação", local: "Local", centralized: "Centralizado", remaining: "restante" },
  ja: { fiveHour: "5時間", weekly: "週間", loading: "読み込み中…", offline: "接続が切れました", updated: "確認", observed: "観測", waiting: "観測待ち", local: "ローカル", centralized: "集中管理", remaining: "残り" },
  ru: { fiveHour: "5 часов", weekly: "Неделя", loading: "Загрузка…", offline: "Соединение потеряно", updated: "Проверено", observed: "Наблюдение", waiting: "Ожидание данных", local: "Локально", centralized: "Централизованно", remaining: "осталось" },
  zh: { fiveHour: "5 小时", weekly: "每周", loading: "加载中…", offline: "连接已断开", updated: "已检查", observed: "观测时间", waiting: "等待观测", local: "本地", centralized: "集中", remaining: "剩余" },
};
const t = (key) => (messages[language] || messages.en)[key];
const locale = () => LOCALE_TAGS[language] || "en-GB";
const $ = (selector, root = document) => root.querySelector(selector);
let showFiveHour = params.get("fiveHour") !== "0";
const showWeekly = params.get("weekly") !== "0";
if (!showFiveHour && !showWeekly) showFiveHour = true;
$("[data-quota='five-hour']").hidden = !showFiveHour;
$("[data-quota='weekly']").hidden = !showWeekly;
document.documentElement.dataset.quotaCount = showFiveHour && showWeekly ? "2" : "1";
if (params.has("theme")) globalThis.CodexUsageThemes.setTheme(params.get("theme"));
let capabilities;
let associationRequired = false;
let failedInitialization = false;
const timeText = (value) => {
  const date = value == null ? null : new Date(value);
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString(locale(), { dateStyle: "medium", timeStyle: "short", ...timeFormatOptions(timeFormat) }) : "—";
};

function render() {
  document.documentElement.lang = language;
  document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = t(node.dataset.i18n); });
  const { data, error, receivedAt, source } = model.snapshot;
  const weekly = weeklyQuotaPeriods(data)[0];
  for (const section of document.querySelectorAll("[data-quota]")) {
    const isWeekly = section.dataset.quota === "weekly";
    const quota = isWeekly ? weekly : data?.fiveHourQuota;
    const short = shortQuotaDisplay(quota);
    const waiting = Boolean(quota?.theoretical || short.expired);
    const remaining = waiting ? null : short.remainingPercent;
    $("[data-remaining]", section).textContent = Number.isFinite(remaining)
      ? `${new Intl.NumberFormat(locale(), { maximumFractionDigits: 1 }).format(remaining)}%` : "—";
    $("[data-reset]", section).textContent = timeText(isWeekly ? quota?.resetsAt : short.resetsAt);
    $("[data-countdown]", section).textContent = waiting ? t("waiting") : quotaCountdownText(short.resetsAt, locale()) || "—";
    const observation = quota?.observedAt;
    $("[data-observed]", section).textContent = `${t("observed")} · ${timeText(observation)}`;
    section.dataset.stale = String(error);
  }
  $("#miniSignIn").hidden = !associationRequired;
  $("#miniAccess").hidden = !globalThis.CodexDesktop;
  $("#miniAccessTitle").textContent = language === "fr" ? "Configurer l’accès" : "Configure access";
  $("#miniHubLabel").textContent = language === "fr" ? "Adresse du hub (fournie par le site)" : "Hub address (provided by the site)";
  $("#miniCodeLabel").textContent = language === "fr" ? "Code d’association à usage unique" : "One-time association code";
  $("#miniAccessHelp").textContent = language === "fr" ? "Dans l’administration du site, créez un code d’association comme pour votre agent. Copiez ici l’adresse du hub et le code. La fenêtre les utilise pour recevoir les quotas." : "Create an association code in the site administration, just as for your agent. Copy the hub address and code here to receive quotas.";
  $("#miniSaveAccess").textContent = language === "fr" ? "Associer la fenêtre" : "Associate window";
  $("#miniSignIn").textContent = language === "fr" ? "Ouvrir l’administration du site" : "Open site administration";
  const status = associationRequired ? (language === "fr" ? "Association au site nécessaire" : "Site association required") : error || failedInitialization ? t("offline") : !data ? t("loading") : `${t("updated")} · ${timeText(receivedAt)}`;
  $("#miniStatus").textContent = `${source ? t(source) + " · " : ""}${status}`;
  $("#miniStatus").dataset.error = String(error || failedInitialization);
}

async function fetchJson(url) {
  if (globalThis.CodexDesktop) {
    const result = await globalThis.CodexDesktop.request(url.replace("./api/", ""));
    associationRequired = Boolean(result.associationRequired);
    if (associationRequired) model.clear();
    if (!result.ok) throw new Error(associationRequired ? "Association required" : "Dashboard unavailable");
    if (["green", "blue", "violet", "amber"].includes(result.data?.theme)) globalThis.CodexUsageThemes.setTheme(result.data.theme);
    return result.data;
  }
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}
const model = createMiniData({ fetchJson, onChange: render });
async function load() {
  try {
    if (!capabilities) capabilities = await fetchJson("./api/capabilities");
    const requested = params.get("source") || stored("codex-usage-data-mode");
    model.setSource(selectMiniSource(capabilities, requested));
    failedInitialization = false;
    await model.load();
  } catch { failedInitialization = true; render(); }
}
globalThis.addEventListener("storage", (event) => {
  if (event.key === "codex-usage-language" && event.newValue) language = resolveLanguage(event.newValue) || "en";
  if (event.key === "codex-usage-time-format") timeFormat = normalizeTimeFormat(event.newValue);
  if (event.key === "codex-usage-data-mode") { params.delete("source"); void load(); }
  render();
});
document.addEventListener("visibilitychange", () => { if (!document.hidden) void load(); });
$("#miniSignIn").addEventListener("click", () => { void globalThis.CodexDesktop?.openAdmin(); });
$("#miniAccess").addEventListener("toggle", () => { void globalThis.CodexDesktop?.configurationSize($("#miniAccess").open); });
$("#miniSaveAccess").addEventListener("click", async () => {
  const input = $("#miniAssociationCode");
  const code = input.value;
  input.value = "";
  $("#miniSaveAccess").disabled = true;
  try {
    await globalThis.CodexDesktop.associate($("#miniHubUrl").value.trim(), code);
    $("#miniAccessError").textContent = "";
    $("#miniAccess").open = false;
    associationRequired = false;
    capabilities = null;
    model.clear();
    await load();
  } catch { $("#miniAccessError").textContent = language === "fr" ? "Association refusée. Vérifiez l’adresse du hub et utilisez un code valide non expiré." : "Association failed. Check the hub address and use a valid, unexpired code."; }
  finally { $("#miniSaveAccess").disabled = false; }
});
render();
void load();
const poll = setInterval(() => { void load(); }, 15_000);
const clock = setInterval(render, 1_000);
globalThis.addEventListener("pagehide", () => { clearInterval(poll); clearInterval(clock); }, { once: true });
