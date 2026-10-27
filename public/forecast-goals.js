import { interpolateForecastPercent } from "./quota-forecast.js";
import { availableResetDeadlines } from "./reset-deadlines.js";

export const FORECAST_GOALS_KEY = "codex-usage-forecast-goals-v1";

// datetime-local is deliberately interpreted as UTC, never as the browser's zone.
export function parseGoalUtc(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value || "")) return null;
  const time = Date.parse(`${value}:00.000Z`);
  if (!Number.isFinite(time)) return null;
  const iso = new Date(time).toISOString();
  return iso.slice(0, 16) === value ? iso : null;
}

export function normalizeForecastGoals(value) {
  const ids = new Set();
  return (Array.isArray(value) ? value : []).flatMap(goal => {
    if (!goal || typeof goal.id !== "string" || !goal.id || ids.has(goal.id)
      || typeof goal.name !== "string" || !goal.name.trim()
      || typeof goal.at !== "string" || !/Z$/.test(goal.at) || !Number.isFinite(Date.parse(goal.at))) return [];
    ids.add(goal.id);
    return [{ id: goal.id, name: goal.name.trim().slice(0, 80), at: new Date(goal.at).toISOString() }];
  }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

export function forecastGoalValue(forecast, at) {
  const time = Date.parse(at), start = Date.parse(forecast?.rangeStart), end = Date.parse(forecast?.rangeEnd);
  if (!Number.isFinite(time) || !Number.isFinite(start) || !Number.isFinite(end)) return { kind: "unavailable", percent: null, inRange: false };
  if (time < start || time > end) return { kind: "outside", percent: null, inRange: false };
  const projected = time > Date.parse(forecast?.actual?.at(-1)?.timestamp);
  const percent = forecast?.status === "ready"
    ? interpolateForecastPercent(projected ? forecast.projected : forecast.actual, time, { clamp: false }) : null;
  const kind = percent === null ? "unavailable" : projected ? "projected" : forecast.historySource === "estimated" ? "estimated" : "observed";
  return { kind, percent, inRange: true };
}

const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));

export function createForecastGoalsController({ root, t, formatPercent, formatDate, onChange, storage = () => localStorage }) {
  let goals = [], resetGoals = [], forecast = null, editingId = null;
  try { goals = normalizeForecastGoals(JSON.parse(storage().getItem(FORECAST_GOALS_KEY) || "[]")); } catch { /* An empty editor remains usable. */ }
  root.innerHTML = `<section id="forecastResetDeadlines" hidden><div class="forecast-goals-heading"><div><h3 data-goal-text="goals.resetsTitle"></h3><p data-goal-text="goals.codexSource"></p></div></div><ol id="forecastResetList" class="forecast-goal-list"></ol></section><div class="forecast-goals-heading"><div><h3 data-goal-text="goals.title"></h3><p data-goal-text="goals.storageHint"></p></div><button id="addForecastGoal" type="button" class="secondary-button" data-goal-text="goals.add"></button></div>
    <form id="forecastGoalForm" class="forecast-goal-form" hidden>
      <label><span data-goal-text="goals.name"></span><input id="forecastGoalName" maxlength="80" required></label>
      <label><span data-goal-text="goals.date"></span><input id="forecastGoalDate" type="datetime-local" step="60" required aria-describedby="forecastGoalZone"></label>
      <div class="forecast-goal-form-actions"><button type="submit" class="primary-button" data-goal-text="goals.save"></button><button id="cancelForecastGoal" type="button" class="secondary-button" data-goal-text="goals.cancel"></button></div>
      <p id="forecastGoalZone" data-goal-text="goals.utcHint"></p>
    </form><p id="forecastGoalError" role="alert" hidden></p><ol id="forecastGoalList" class="forecast-goal-list"></ol>`;
  const find = selector => root.querySelector(selector);
  const form = find("#forecastGoalForm"), name = find("#forecastGoalName"), date = find("#forecastGoalDate"), error = find("#forecastGoalError");
  function showError(key) { error.textContent = t(key); error.hidden = false; }
  function closeEditor() { form.hidden = true; editingId = null; error.hidden = true; form.reset(); find("#addForecastGoal").focus(); }
  function openEditor(goal) {
    editingId = goal?.id || null;
    name.value = goal?.name || "";
    date.value = goal?.at.slice(0, 16) || "";
    error.hidden = true;
    form.hidden = false;
    name.focus();
  }
  function save(next) {
    try { storage().setItem(FORECAST_GOALS_KEY, JSON.stringify(next)); }
    catch { showError("goals.storageError"); return false; }
    goals = next;
    onChange();
    return true;
  }
  find("#addForecastGoal").onclick = () => openEditor();
  find("#cancelForecastGoal").onclick = closeEditor;
  form.onsubmit = event => {
    event.preventDefault();
    const at = parseGoalUtc(date.value);
    if (!at || !name.value.trim()) { showError("goals.invalid"); return; }
    const next = normalizeForecastGoals([...goals.filter(goal => goal.id !== editingId), { id: editingId || crypto.randomUUID(), name: name.value, at }]);
    if (save(next)) closeEditor();
  };
  find("#forecastGoalList").onclick = event => {
    const button = event.target.closest("button[data-goal-action]");
    const goal = goals.find(goal => goal.id === button?.dataset.goalId);
    if (!goal) return;
    if (button.dataset.goalAction === "edit") openEditor(goal);
    else if (save(goals.filter(item => item.id !== goal.id))) {
      if (editingId === goal.id) closeEditor();
      error.hidden = true;
      find("#addForecastGoal").focus();
    }
  };
  function resultText(result) {
    const label = t(`goals.${result.kind}`);
    return result.percent === null ? label : `${label} · ${formatPercent(result.percent)} %`;
  }
  return {
    render(value, quota = null) {
      forecast = value;
      resetGoals = availableResetDeadlines(quota).map((item, index) => ({ at: item.expiresAt,
        name: t(item.count === 1 ? "goals.reset" : "goals.resets", { count: item.count }), badge: `R${index + 1}`, automatic: true }));
      root.querySelectorAll("[data-goal-text]").forEach(element => { element.textContent = t(element.dataset.goalText); });
      find("#forecastResetDeadlines").hidden = !resetGoals.length;
      find("#forecastResetList").innerHTML = resetGoals.map(goal => {
        const result = forecastGoalValue(forecast, goal.at);
        return `<li class="forecast-goal-row forecast-reset-row${result.inRange ? "" : " is-outside"}"><span class="forecast-goal-number">${goal.badge}</span><div class="forecast-goal-detail"><strong>${escape(goal.name)}</strong><time datetime="${goal.at}">${escape(formatDate(goal.at))}</time></div><div class="forecast-goal-result${result.percent > 100 ? " is-over" : ""}">${result.percent === null ? `<small>${escape(resultText(result))}</small>` : `<strong>${escape(formatPercent(result.percent))} %</strong><small>${escape(t(`goals.${result.kind}`))}</small>`}</div></li>`;
      }).join("");
      name.placeholder = t("goals.example");
      find("#forecastGoalList").innerHTML = goals.map((goal, index) => {
        const result = forecastGoalValue(forecast, goal.at);
        return `<li class="forecast-goal-row${result.inRange ? "" : " is-outside"}"><span class="forecast-goal-number">${index + 1}</span><div class="forecast-goal-detail"><strong>${escape(goal.name)}</strong><time datetime="${goal.at}">${escape(formatDate(goal.at))}</time></div>
          <div class="forecast-goal-result${result.percent > 100 ? " is-over" : ""}">${result.percent === null ? `<small>${escape(resultText(result))}</small>` : `<strong>${escape(formatPercent(result.percent))} %</strong><small>${escape(t(`goals.${result.kind}`))}</small>`}</div>
          <div class="forecast-goal-actions"><button type="button" class="secondary-button" data-goal-action="edit" data-goal-id="${escape(goal.id)}" aria-label="${escape(t("goals.editNamed", { name: goal.name }))}">${escape(t("goals.edit"))}</button><button type="button" class="secondary-button" data-goal-action="remove" data-goal-id="${escape(goal.id)}" aria-label="${escape(t("goals.removeNamed", { name: goal.name }))}">${escape(t("goals.remove"))}</button></div></li>`;
      }).join("") || `<li class="forecast-goals-empty">${escape(t("goals.empty"))}</li>`;
    },
    markers(value, { x, y, top, bottom }) {
      // Numbered badges link to full labels below without crowding the plot.
      const laneEnds = [];
      return [...resetGoals, ...goals.map((goal, index) => ({ ...goal, badge: index + 1 }))].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(goal => {
        const result = forecastGoalValue(value, goal.at);
        if (!result.inRange) return "";
        const left = x(goal.at);
        let lane = laneEnds.findIndex(end => left - end >= 24);
        if (lane < 0) lane = laneEnds.length;
        laneEnds[lane] = left;
        const badgeY = top + 10 + lane * 22;
        return `<g class="quota-goal-marker${goal.automatic ? " quota-reset-marker" : ""}" role="img" aria-label="${escape(`${goal.name} · ${formatDate(goal.at)} · ${resultText(result)}`)}"><title>${escape(`${goal.name} · ${formatDate(goal.at)} · ${resultText(result)}`)}</title>
          <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}"></line>
          ${result.percent === null ? "" : `<circle class="quota-goal-point" cx="${left}" cy="${y(result.percent)}" r="5"></circle>`}
          <circle class="quota-goal-badge" cx="${left}" cy="${badgeY}" r="11"></circle><text x="${left}" y="${badgeY + 3.5}" text-anchor="middle">${goal.badge}</text>
          ${goal.automatic && result.percent !== null ? `<text class="quota-reset-value" x="${left - 9}" y="${y(result.percent) - 10}" text-anchor="end">${escape(formatPercent(result.percent))} %</text>` : ""}</g>`;
      }).join("");
    },
  };
}

export const FORECAST_GOALS_I18N = {
  fr: {
    "goals.resetsTitle": "Resets à utiliser avant expiration", "goals.codexSource": "Échéances synchronisées depuis Codex", "goals.reset": "1 reset à utiliser avant", "goals.resets": "{count} resets à utiliser avant",
    "goals.title": "Dates objectifs", "goals.storageHint": "Conservées dans ce navigateur", "goals.add": "Ajouter une date", "goals.name": "Objectif", "goals.date": "Date et heure (UTC)", "goals.save": "Enregistrer", "goals.cancel": "Annuler", "goals.utcHint": "Heure UTC : 20:00 correspond à 20 h UTC, quel que soit votre fuseau.", "goals.example": "Livraison du projet…", "goals.empty": "Ajoutez une échéance pour voir la consommation prévue à cette date.", "goals.edit": "Modifier", "goals.remove": "Supprimer", "goals.editNamed": "Modifier : {name}", "goals.removeNamed": "Supprimer : {name}", "goals.projected": "Consommation prévue", "goals.observed": "Consommation observée", "goals.estimated": "Historique estimé", "goals.outside": "Hors de la période affichée", "goals.unavailable": "Estimation indisponible", "goals.invalid": "Indiquez un objectif et une date UTC valide.", "goals.storageError": "Enregistrement impossible dans ce navigateur. Vos modifications n’ont pas été enregistrées."
  },
  en: {
    "goals.resetsTitle": "Use resets before expiry", "goals.codexSource": "Deadlines synced from Codex", "goals.reset": "Use 1 reset before", "goals.resets": "Use {count} resets before",
    "goals.title": "Target dates", "goals.storageHint": "Saved in this browser", "goals.add": "Add a date", "goals.name": "Goal", "goals.date": "Date and time (UTC)", "goals.save": "Save", "goals.cancel": "Cancel", "goals.utcHint": "UTC time: 20:00 means 8 pm UTC, regardless of your time zone.", "goals.example": "Project delivery…", "goals.empty": "Add a deadline to see the expected usage at that date.", "goals.edit": "Edit", "goals.remove": "Delete", "goals.editNamed": "Edit: {name}", "goals.removeNamed": "Delete: {name}", "goals.projected": "Expected usage", "goals.observed": "Observed usage", "goals.estimated": "Estimated history", "goals.outside": "Outside the displayed period", "goals.unavailable": "Estimate unavailable", "goals.invalid": "Enter a goal and a valid UTC date.", "goals.storageError": "This browser could not save your changes. They have not been saved."
  },
  de: {
    "goals.resetsTitle": "Resets vor Ablauf nutzen", "goals.codexSource": "Fristen von Codex synchronisiert", "goals.reset": "1 Reset nutzen vor", "goals.resets": "{count} Resets nutzen vor",
    "goals.title": "Zieltermine", "goals.storageHint": "In diesem Browser gespeichert", "goals.add": "Termin hinzufügen", "goals.name": "Ziel", "goals.date": "Datum und Uhrzeit (UTC)", "goals.save": "Speichern", "goals.cancel": "Abbrechen", "goals.utcHint": "UTC-Zeit: 20:00 entspricht 20 Uhr UTC, unabhängig von Ihrer Zeitzone.", "goals.example": "Reset nutzen vor…", "goals.empty": "Fügen Sie einen Termin hinzu, um den erwarteten Verbrauch zu sehen.", "goals.edit": "Bearbeiten", "goals.remove": "Löschen", "goals.editNamed": "Bearbeiten: {name}", "goals.removeNamed": "Löschen: {name}", "goals.projected": "Erwarteter Verbrauch", "goals.observed": "Beobachteter Verbrauch", "goals.estimated": "Geschätzter Verlauf", "goals.outside": "Außerhalb des angezeigten Zeitraums", "goals.unavailable": "Schätzung nicht verfügbar", "goals.invalid": "Geben Sie ein Ziel und ein gültiges UTC-Datum ein.", "goals.storageError": "Dieser Browser konnte Ihre Änderungen nicht speichern."
  },
  es: {
    "goals.resetsTitle": "Usar resets antes de caducar", "goals.codexSource": "Fechas sincronizadas desde Codex", "goals.reset": "Usar 1 reset antes de", "goals.resets": "Usar {count} resets antes de",
    "goals.title": "Fechas objetivo", "goals.storageHint": "Guardadas en este navegador", "goals.add": "Añadir fecha", "goals.name": "Objetivo", "goals.date": "Fecha y hora (UTC)", "goals.save": "Guardar", "goals.cancel": "Cancelar", "goals.utcHint": "Hora UTC: 20:00 significa las 20 h UTC, independientemente de su zona horaria.", "goals.example": "Usar el reset antes de…", "goals.empty": "Añada una fecha límite para ver el consumo previsto en esa fecha.", "goals.edit": "Editar", "goals.remove": "Eliminar", "goals.editNamed": "Editar: {name}", "goals.removeNamed": "Eliminar: {name}", "goals.projected": "Consumo previsto", "goals.observed": "Consumo observado", "goals.estimated": "Historial estimado", "goals.outside": "Fuera del período mostrado", "goals.unavailable": "Estimación no disponible", "goals.invalid": "Introduzca un objetivo y una fecha UTC válida.", "goals.storageError": "Este navegador no pudo guardar los cambios. No se han guardado."
  },
  it: {
    "goals.resetsTitle": "Usare i reset prima della scadenza", "goals.codexSource": "Scadenze sincronizzate da Codex", "goals.reset": "Usare 1 reset prima del", "goals.resets": "Usare {count} reset prima del",
    "goals.title": "Date obiettivo", "goals.storageHint": "Salvate in questo browser", "goals.add": "Aggiungi data", "goals.name": "Obiettivo", "goals.date": "Data e ora (UTC)", "goals.save": "Salva", "goals.cancel": "Annulla", "goals.utcHint": "Ora UTC: 20:00 indica le 20 UTC, indipendentemente dal fuso orario.", "goals.example": "Usare il reset prima di…", "goals.empty": "Aggiungi una scadenza per vedere il consumo previsto a quella data.", "goals.edit": "Modifica", "goals.remove": "Elimina", "goals.editNamed": "Modifica: {name}", "goals.removeNamed": "Elimina: {name}", "goals.projected": "Consumo previsto", "goals.observed": "Consumo osservato", "goals.estimated": "Storico stimato", "goals.outside": "Fuori dal periodo visualizzato", "goals.unavailable": "Stima non disponibile", "goals.invalid": "Inserisci un obiettivo e una data UTC valida.", "goals.storageError": "Il browser non ha potuto salvare le modifiche. Non sono state salvate."
  },
  pt: {
    "goals.resetsTitle": "Usar resets antes de expirar", "goals.codexSource": "Prazos sincronizados do Codex", "goals.reset": "Usar 1 reset antes de", "goals.resets": "Usar {count} resets antes de",
    "goals.title": "Datas objetivo", "goals.storageHint": "Guardadas neste navegador", "goals.add": "Adicionar data", "goals.name": "Objetivo", "goals.date": "Data e hora (UTC)", "goals.save": "Guardar", "goals.cancel": "Cancelar", "goals.utcHint": "Hora UTC: 20:00 significa 20 h UTC, independentemente do fuso horário.", "goals.example": "Usar o reset antes de…", "goals.empty": "Adicione um prazo para ver o consumo previsto nessa data.", "goals.edit": "Editar", "goals.remove": "Eliminar", "goals.editNamed": "Editar: {name}", "goals.removeNamed": "Eliminar: {name}", "goals.projected": "Consumo previsto", "goals.observed": "Consumo observado", "goals.estimated": "Histórico estimado", "goals.outside": "Fora do período apresentado", "goals.unavailable": "Estimativa indisponível", "goals.invalid": "Introduza um objetivo e uma data UTC válida.", "goals.storageError": "Este navegador não conseguiu guardar as alterações. Não foram guardadas."
  },
  ja: {
    "goals.resetsTitle": "有効期限前にリセットを使用", "goals.codexSource": "Codexから同期した期限", "goals.reset": "この日時までに1回リセット", "goals.resets": "この日時までに{count}回リセット",
    "goals.title": "目標日時", "goals.storageHint": "このブラウザーに保存", "goals.add": "日時を追加", "goals.name": "目標", "goals.date": "日時（UTC）", "goals.save": "保存", "goals.cancel": "キャンセル", "goals.utcHint": "UTC時刻：20:00は、お使いのタイムゾーンに関係なくUTCの20時です。", "goals.example": "リセットを使う期限…", "goals.empty": "期限を追加すると、その日時の予測使用量を確認できます。", "goals.edit": "編集", "goals.remove": "削除", "goals.editNamed": "編集：{name}", "goals.removeNamed": "削除：{name}", "goals.projected": "予測使用量", "goals.observed": "観測使用量", "goals.estimated": "推定履歴", "goals.outside": "表示期間外", "goals.unavailable": "推定できません", "goals.invalid": "目標と有効なUTC日時を入力してください。", "goals.storageError": "このブラウザーでは変更を保存できませんでした。変更は保存されていません。"
  },
  ru: {
    "goals.resetsTitle": "Использовать сбросы до истечения срока", "goals.codexSource": "Сроки синхронизированы с Codex", "goals.reset": "Использовать 1 сброс до", "goals.resets": "Использовать {count} сбросов до",
    "goals.title": "Целевые даты", "goals.storageHint": "Сохранены в этом браузере", "goals.add": "Добавить дату", "goals.name": "Цель", "goals.date": "Дата и время (UTC)", "goals.save": "Сохранить", "goals.cancel": "Отмена", "goals.utcHint": "Время UTC: 20:00 означает 20 часов UTC независимо от вашего часового пояса.", "goals.example": "Использовать сброс до…", "goals.empty": "Добавьте срок, чтобы увидеть ожидаемый расход на эту дату.", "goals.edit": "Изменить", "goals.remove": "Удалить", "goals.editNamed": "Изменить: {name}", "goals.removeNamed": "Удалить: {name}", "goals.projected": "Ожидаемый расход", "goals.observed": "Наблюдаемый расход", "goals.estimated": "Оценка истории", "goals.outside": "Вне показанного периода", "goals.unavailable": "Оценка недоступна", "goals.invalid": "Введите цель и корректную дату UTC.", "goals.storageError": "Браузеру не удалось сохранить изменения. Они не сохранены."
  },
  zh: {
    "goals.resetsTitle": "在到期前使用重置", "goals.codexSource": "截止时间同步自 Codex", "goals.reset": "在此之前使用 1 次重置", "goals.resets": "在此之前使用 {count} 次重置",
    "goals.title": "目标日期", "goals.storageHint": "保存在此浏览器中", "goals.add": "添加日期", "goals.name": "目标", "goals.date": "日期和时间（UTC）", "goals.save": "保存", "goals.cancel": "取消", "goals.utcHint": "UTC 时间：20:00 表示 UTC 晚上 8 点，与您的时区无关。", "goals.example": "在此之前使用重置…", "goals.empty": "添加截止日期，查看该日期的预计用量。", "goals.edit": "编辑", "goals.remove": "删除", "goals.editNamed": "编辑：{name}", "goals.removeNamed": "删除：{name}", "goals.projected": "预计用量", "goals.observed": "观测用量", "goals.estimated": "估算历史", "goals.outside": "不在显示的期间内", "goals.unavailable": "无法估算", "goals.invalid": "请输入目标和有效的 UTC 日期。", "goals.storageError": "此浏览器无法保存更改。更改尚未保存。"
  },
};
