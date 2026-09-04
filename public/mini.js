const language = navigator.languages?.[0] || navigator.language || "en";
const text = {
  en: { fiveHour: "5 hours", weekly: "Weekly", error: "Unable to load quota data" },
  fr: { fiveHour: "5 heures", weekly: "Hebdomadaire", error: "Impossible de charger les quotas" },
  de: { fiveHour: "5 Stunden", weekly: "Wöchentlich", error: "Kontingente konnten nicht geladen werden" },
};
const localeText = text[language.toLowerCase().split(/[-_]/)[0]] || text.en;
document.querySelectorAll("[data-i18n]").forEach((node) => { node.textContent = localeText[node.dataset.i18n] || node.textContent; });
const $ = (selector, root = document) => root.querySelector(selector);
const params = new URLSearchParams(window.location.search);
let showFiveHour = params.get("fiveHour") !== "0";
let showWeekly = params.get("weekly") !== "0";
if (!showFiveHour && !showWeekly) showFiveHour = true;
$("[data-quota='five-hour']").hidden = !showFiveHour;
$("[data-quota='weekly']").hidden = !showWeekly;
document.documentElement.dataset.quotaCount = showFiveHour && showWeekly ? "2" : "1";
const countdown = (value) => {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "—";
  const seconds = Math.max(0, Math.floor((timestamp - Date.now()) / 1_000));
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds % 86_400 / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  const secs = seconds % 60;
  return days ? `${days}d ${hours}h ${minutes}m` : `${hours}h ${minutes}m ${secs}s`;
};
const resetText = (value) => {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(language, { dateStyle: "medium", timeStyle: "short" }) : "—";
};
let data = null;
function render() {
  for (const section of document.querySelectorAll("[data-quota]")) {
    const quota = data?.[section.dataset.quota === "five-hour" ? "fiveHourQuota" : "weeklyQuota"];
    const remaining = Number.isFinite(quota?.remainingPercent) ? `${new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(quota.remainingPercent)}%` : "—";
    $("[data-remaining]", section).textContent = remaining;
    $("[data-reset]", section).textContent = resetText(quota?.resetsAt);
    $("[data-countdown]", section).textContent = countdown(quota?.resetsAt);
  }
}
async function load() {
  try {
    const response = await fetch("./api/usage?source=local", { cache: "no-store" });
    if (!response.ok) throw new Error();
    data = await response.json();
    render();
  } catch {
    document.title = localeText.error;
  }
}
load();
setInterval(() => { render(); load(); }, 30_000);
setInterval(render, 1_000);
