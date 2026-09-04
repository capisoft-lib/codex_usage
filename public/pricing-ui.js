import { PRICING_CATALOG, PRICING_CATALOG_VERSION, PRICING_VERIFIED_AT, catalogStatus, sourceUrl } from "./pricing-catalog.js";
import { apiCostOfCalls } from "./api-pricing.js";
import { codexCreditsOfCalls } from "./usage-pricing.js";

export const PRICING_I18N = {
  "fr": {
    "dated.basis": "Base du calcul API",
    "dated.historical": "Tarifs à la date des appels",
    "dated.current": "Simulation aux tarifs actuels",
    "dated.custom": "Simulation personnalisée",
    "dated.catalog": "Catalogue {version} · vérifié le {date}",
    "dated.history": "Historique des tarifs",
    "dated.period": "Période UTC",
    "dated.billing": "Grille",
    "dated.rates": "Entrée / cache / sortie par million",
    "dated.source": "Source",
    "dated.documented": "Documenté",
    "dated.reconstructed": "Reconstruit",
    "dated.observed": "Observé",
    "dated.unrated": "{n} appels non tarifés, exclus du montant",
    "dated.estimated": "{n} appels estimés (historique ou date imprécise)",
    "dated.dateNote": "Changements datés au jour : bascule conventionnelle à 00:00 UTC. Les appels du jour de bascule sont signalés comme estimés.",
    "dated.legacy": "Vos anciens tarifs sont conservés dans la simulation personnalisée. L’historique utilise désormais le catalogue daté.",
    "dated.stale": "Le catalogue doit être revérifié.",
    "dated.export": "Exporter le calcul",
    "dated.creditNote": "Les crédits Codex restent calculés aux tarifs de l’époque. Les simulations ne modifient pas les consommations enregistrées.",
    "dated.ongoing": "En cours",
    "dated.unknown": "Sans tarif publié",
    "dated.historicalTitle": "Tarifs historiques : équivalent API",
    "dated.allModels": "Tous les modèles",
    "dated.copy": "Tarifs API Standard en USD par million. Fast et contexte long sont appliqués selon les règles datées ; hors frais d’outils et écritures de cache.",
    "dated.exported": "Rapport du calcul téléchargé",
    "dated.fast": "Supplément Fast",
    "dated.long": "Seuil de contexte long"
  },
  "en": {
    "dated.basis": "API calculation basis",
    "dated.historical": "Rates at the time of each call",
    "dated.current": "Simulation at current rates",
    "dated.custom": "Custom simulation",
    "dated.catalog": "Catalog {version} · checked {date}",
    "dated.history": "Rate history",
    "dated.period": "UTC period",
    "dated.billing": "Rate card",
    "dated.rates": "Input / cache / output per million",
    "dated.source": "Source",
    "dated.documented": "Documented",
    "dated.reconstructed": "Reconstructed",
    "dated.observed": "Observed",
    "dated.unrated": "{n} unrated calls excluded from the amount",
    "dated.estimated": "{n} estimated calls (history or imprecise date)",
    "dated.dateNote": "Day-only changes use a 00:00 UTC convention. Calls on the change day are marked estimated.",
    "dated.legacy": "Your previous prices are retained in custom simulation. Historical costs now use the dated catalog.",
    "dated.stale": "The catalog needs rechecking.",
    "dated.export": "Export calculation",
    "dated.creditNote": "Codex credits always use historical rates. Simulations do not change recorded usage.",
    "dated.ongoing": "Ongoing",
    "dated.unknown": "No published rate",
    "dated.historicalTitle": "Historical rates: API equivalent",
    "dated.allModels": "All models",
    "dated.copy": "Standard API prices in USD per million. Fast and long context follow dated rules; excludes tool fees and cache writes.",
    "dated.exported": "Calculation report downloaded",
    "dated.fast": "Fast premium",
    "dated.long": "Long-context threshold"
  },
  "de": {
    "dated.basis": "API-Berechnungsbasis",
    "dated.historical": "Tarife zum Aufrufzeitpunkt",
    "dated.current": "Simulation mit aktuellen Tarifen",
    "dated.custom": "Eigene Simulation",
    "dated.catalog": "Katalog {version} · geprüft am {date}",
    "dated.history": "Tarifverlauf",
    "dated.period": "UTC-Zeitraum",
    "dated.billing": "Tariftabelle",
    "dated.rates": "Eingabe / Cache / Ausgabe pro Million",
    "dated.source": "Quelle",
    "dated.documented": "Dokumentiert",
    "dated.reconstructed": "Rekonstruiert",
    "dated.observed": "Beobachtet",
    "dated.unrated": "{n} Aufrufe ohne Tarif nicht im Betrag enthalten",
    "dated.estimated": "{n} geschätzte Aufrufe (Verlauf oder ungenaues Datum)",
    "dated.dateNote": "Tagesgenaue Änderungen gelten konventionell ab 00:00 UTC. Aufrufe am Änderungstag gelten als geschätzt.",
    "dated.legacy": "Bisherige Preise bleiben in der eigenen Simulation erhalten. Historische Kosten verwenden den datierten Katalog.",
    "dated.stale": "Der Katalog muss erneut geprüft werden.",
    "dated.export": "Berechnung exportieren",
    "dated.creditNote": "Codex-Credits verwenden historische Tarife. Simulationen ändern keine erfasste Nutzung.",
    "dated.ongoing": "Laufend",
    "dated.unknown": "Kein veröffentlichter Tarif",
    "dated.historicalTitle": "Historische Tarife: API-Äquivalent",
    "dated.allModels": "Alle Modelle",
    "dated.copy": "Standard-API-Preise in USD pro Million. Fast und Langkontext folgen datierten Regeln; ohne Tool- und Cache-Schreibkosten.",
    "dated.exported": "Berechnungsbericht heruntergeladen",
    "dated.fast": "Fast-Aufpreis",
    "dated.long": "Langkontext-Schwelle"
  },
  "es": {
    "dated.basis": "Base del cálculo API",
    "dated.historical": "Tarifas en la fecha de cada llamada",
    "dated.current": "Simulación con tarifas actuales",
    "dated.custom": "Simulación personalizada",
    "dated.catalog": "Catálogo {version} · verificado {date}",
    "dated.history": "Historial de tarifas",
    "dated.period": "Periodo UTC",
    "dated.billing": "Tarifas",
    "dated.rates": "Entrada / caché / salida por millón",
    "dated.source": "Fuente",
    "dated.documented": "Documentado",
    "dated.reconstructed": "Reconstruido",
    "dated.observed": "Observado",
    "dated.unrated": "{n} llamadas sin tarifa excluidas del importe",
    "dated.estimated": "{n} llamadas estimadas (historial o fecha imprecisa)",
    "dated.dateNote": "Los cambios diarios se aplican por convenio a las 00:00 UTC. Las llamadas de ese día se marcan como estimadas.",
    "dated.legacy": "Los precios anteriores se conservan en la simulación personalizada. El historial usa el catálogo fechado.",
    "dated.stale": "Es necesario verificar el catálogo.",
    "dated.export": "Exportar cálculo",
    "dated.creditNote": "Los créditos Codex siempre usan tarifas históricas. Las simulaciones no cambian el consumo registrado.",
    "dated.ongoing": "En curso",
    "dated.unknown": "Sin tarifa publicada",
    "dated.historicalTitle": "Tarifas históricas: equivalente API",
    "dated.allModels": "Todos los modelos",
    "dated.copy": "Precios API Standard en USD por millón. Fast y contexto largo siguen reglas fechadas; sin herramientas ni escrituras de caché.",
    "dated.exported": "Informe del cálculo descargado",
    "dated.fast": "Recargo Fast",
    "dated.long": "Umbral de contexto largo"
  },
  "it": {
    "dated.basis": "Base del calcolo API",
    "dated.historical": "Tariffe alla data delle chiamate",
    "dated.current": "Simulazione con tariffe attuali",
    "dated.custom": "Simulazione personalizzata",
    "dated.catalog": "Catalogo {version} · verificato {date}",
    "dated.history": "Storico delle tariffe",
    "dated.period": "Periodo UTC",
    "dated.billing": "Tariffe",
    "dated.rates": "Input / cache / output per milione",
    "dated.source": "Fonte",
    "dated.documented": "Documentato",
    "dated.reconstructed": "Ricostruito",
    "dated.observed": "Osservato",
    "dated.unrated": "{n} chiamate senza tariffa escluse dall’importo",
    "dated.estimated": "{n} chiamate stimate (storico o data imprecisa)",
    "dated.dateNote": "I cambiamenti giornalieri si applicano per convenzione alle 00:00 UTC. Le chiamate di quel giorno sono stimate.",
    "dated.legacy": "I prezzi precedenti restano nella simulazione personalizzata. Lo storico usa il catalogo datato.",
    "dated.stale": "Il catalogo deve essere ricontrollato.",
    "dated.export": "Esporta calcolo",
    "dated.creditNote": "I crediti Codex usano sempre tariffe storiche. Le simulazioni non modificano il consumo registrato.",
    "dated.ongoing": "In corso",
    "dated.unknown": "Nessuna tariffa pubblicata",
    "dated.historicalTitle": "Tariffe storiche: equivalente API",
    "dated.allModels": "Tutti i modelli",
    "dated.copy": "Prezzi API Standard in USD per milione. Fast e contesto lungo seguono regole datate; esclusi strumenti e scritture cache.",
    "dated.exported": "Rapporto del calcolo scaricato",
    "dated.fast": "Supplemento Fast",
    "dated.long": "Soglia di contesto lungo"
  },
  "pt": {
    "dated.basis": "Base do cálculo API",
    "dated.historical": "Tarifas na data das chamadas",
    "dated.current": "Simulação com tarifas atuais",
    "dated.custom": "Simulação personalizada",
    "dated.catalog": "Catálogo {version} · verificado {date}",
    "dated.history": "Histórico de tarifas",
    "dated.period": "Período UTC",
    "dated.billing": "Tarifas",
    "dated.rates": "Entrada / cache / saída por milhão",
    "dated.source": "Fonte",
    "dated.documented": "Documentado",
    "dated.reconstructed": "Reconstruído",
    "dated.observed": "Observado",
    "dated.unrated": "{n} chamadas sem tarifa excluídas do valor",
    "dated.estimated": "{n} chamadas estimadas (histórico ou data imprecisa)",
    "dated.dateNote": "Alterações diárias aplicam-se por convenção às 00:00 UTC. As chamadas desse dia são estimadas.",
    "dated.legacy": "Os preços anteriores ficam na simulação personalizada. O histórico usa o catálogo datado.",
    "dated.stale": "O catálogo precisa de nova verificação.",
    "dated.export": "Exportar cálculo",
    "dated.creditNote": "Os créditos Codex usam sempre tarifas históricas. As simulações não alteram o consumo registado.",
    "dated.ongoing": "Em curso",
    "dated.unknown": "Sem tarifa publicada",
    "dated.historicalTitle": "Tarifas históricas: equivalente API",
    "dated.allModels": "Todos os modelos",
    "dated.copy": "Preços API Standard em USD por milhão. Fast e contexto longo seguem regras datadas; excluem ferramentas e escritas em cache.",
    "dated.exported": "Relatório do cálculo transferido",
    "dated.fast": "Suplemento Fast",
    "dated.long": "Limiar de contexto longo"
  },
  "ja": {
    "dated.basis": "API計算基準",
    "dated.historical": "各呼び出し時点の料金",
    "dated.current": "現在の料金でシミュレーション",
    "dated.custom": "カスタムシミュレーション",
    "dated.catalog": "料金表 {version} · 確認日 {date}",
    "dated.history": "料金履歴",
    "dated.period": "UTC期間",
    "dated.billing": "料金体系",
    "dated.rates": "100万トークン当たりの入力 / キャッシュ / 出力",
    "dated.source": "出典",
    "dated.documented": "文書で確認",
    "dated.reconstructed": "再構成",
    "dated.observed": "観測済み",
    "dated.unrated": "料金不明の{n}件は金額に含まれません",
    "dated.estimated": "{n}件は推定（履歴または日時が不明確）",
    "dated.dateNote": "日単位の変更は便宜上UTC 00:00に適用します。変更当日の呼び出しは推定扱いです。",
    "dated.legacy": "以前の料金はカスタムシミュレーションに保存されています。履歴には日付付き料金表を使います。",
    "dated.stale": "料金表の再確認が必要です。",
    "dated.export": "計算をエクスポート",
    "dated.creditNote": "Codexクレジットには常に過去の料金を使います。シミュレーションは記録された使用量を変更しません。",
    "dated.ongoing": "継続中",
    "dated.unknown": "公開料金なし",
    "dated.historicalTitle": "過去の料金：API換算",
    "dated.allModels": "すべてのモデル",
    "dated.copy": "100万トークン当たりのStandard API料金（USD）。Fastと長文脈には日付付き規則を適用。ツールとキャッシュ書き込み料金は除外。",
    "dated.exported": "計算レポートをダウンロードしました",
    "dated.fast": "Fast追加料金",
    "dated.long": "長文脈のしきい値"
  },
  "ru": {
    "dated.basis": "Основа расчёта API",
    "dated.historical": "Тарифы на дату вызовов",
    "dated.current": "Расчёт по текущим тарифам",
    "dated.custom": "Пользовательский расчёт",
    "dated.catalog": "Каталог {version} · проверен {date}",
    "dated.history": "История тарифов",
    "dated.period": "Период UTC",
    "dated.billing": "Тарифы",
    "dated.rates": "Ввод / кэш / вывод за миллион",
    "dated.source": "Источник",
    "dated.documented": "Подтверждено",
    "dated.reconstructed": "Восстановлено",
    "dated.observed": "Наблюдалось",
    "dated.unrated": "{n} вызовов без тарифа исключены из суммы",
    "dated.estimated": "{n} оценочных вызовов (история или неточная дата)",
    "dated.dateNote": "Изменения с точностью до дня условно действуют с 00:00 UTC. Вызовы в этот день помечены как оценочные.",
    "dated.legacy": "Прежние цены сохранены в пользовательском расчёте. История использует датированный каталог.",
    "dated.stale": "Каталог требует повторной проверки.",
    "dated.export": "Экспорт расчёта",
    "dated.creditNote": "Кредиты Codex всегда используют исторические тарифы. Расчёты не изменяют записанный расход.",
    "dated.ongoing": "Действует",
    "dated.unknown": "Тариф не опубликован",
    "dated.historicalTitle": "Исторические тарифы: эквивалент API",
    "dated.allModels": "Все модели",
    "dated.copy": "Цены Standard API в USD за миллион. Fast и длинный контекст следуют датированным правилам; без инструментов и записи кэша.",
    "dated.exported": "Отчёт расчёта загружен",
    "dated.fast": "Наценка Fast",
    "dated.long": "Порог длинного контекста"
  },
  "zh": {
    "dated.basis": "API 计算依据",
    "dated.historical": "按调用时的价格",
    "dated.current": "按当前价格模拟",
    "dated.custom": "自定义模拟",
    "dated.catalog": "价格表 {version} · 核实于 {date}",
    "dated.history": "价格历史",
    "dated.period": "UTC 时间段",
    "dated.billing": "计费方式",
    "dated.rates": "每百万输入 / 缓存 / 输出",
    "dated.source": "来源",
    "dated.documented": "已证实",
    "dated.reconstructed": "重建",
    "dated.observed": "已观测",
    "dated.unrated": "{n} 次未定价调用未计入金额",
    "dated.estimated": "{n} 次估算调用（历史或日期不明确）",
    "dated.dateNote": "仅明确日期的变更约定于 UTC 00:00 生效。变更当天的调用标为估算。",
    "dated.legacy": "以前的价格保留在自定义模拟中。历史计算现使用带日期的价格表。",
    "dated.stale": "价格表需要重新核实。",
    "dated.export": "导出计算",
    "dated.creditNote": "Codex 积分始终按历史价格计算。模拟不会更改已记录的用量。",
    "dated.ongoing": "当前有效",
    "dated.unknown": "无公开价格",
    "dated.historicalTitle": "历史价格：API 等值",
    "dated.allModels": "所有模型",
    "dated.copy": "每百万 token 的 Standard API 美元价格。Fast 和长上下文遵循带日期规则；不含工具和缓存写入费用。",
    "dated.exported": "计算报告已下载",
    "dated.fast": "Fast 附加费用",
    "dated.long": "长上下文阈值"
  }
};

const CACHE_WRITE_I18N = {
  "fr": [
    "Écriture de cache",
    "{n} appels sans mesure des écritures de cache",
    "Écritures de cache observées incluses ; hors frais non observés",
    "Tarifs API Standard en USD par million. Fast, contexte long et écritures de cache observées suivent les règles datées. Les autres frais non observés sont exclus."
  ],
  "en": [
    "Cache writes",
    "{n} calls without cache-write measurements",
    "Observed cache writes included; unobserved fees excluded",
    "Standard API prices in USD per million. Fast, long context and observed cache writes follow dated rules. Other unobserved fees are excluded."
  ],
  "de": [
    "Cache-Schreibvorgänge",
    "{n} Aufrufe ohne Cache-Schreibmessung",
    "Erfasste Cache-Schreibvorgänge enthalten; nicht erfasste Gebühren ausgeschlossen",
    "Standard-API-Preise in USD pro Million. Fast, Langkontext und erfasste Cache-Schreibvorgänge folgen datierten Regeln. Andere nicht erfasste Gebühren sind ausgeschlossen."
  ],
  "es": [
    "Escrituras de caché",
    "{n} llamadas sin medición de escritura en caché",
    "Escrituras de caché observadas incluidas; otros cargos no observados excluidos",
    "Precios API Standard en USD por millón. Fast, contexto largo y escrituras de caché observadas siguen reglas fechadas. Otros cargos no observados se excluyen."
  ],
  "it": [
    "Scritture cache",
    "{n} chiamate senza misurazione delle scritture cache",
    "Scritture cache osservate incluse; costi non osservati esclusi",
    "Prezzi API Standard in USD per milione. Fast, contesto lungo e scritture cache osservate seguono regole datate. Altri costi non osservati sono esclusi."
  ],
  "pt": [
    "Escritas em cache",
    "{n} chamadas sem medição de escritas em cache",
    "Escritas em cache observadas incluídas; custos não observados excluídos",
    "Preços API Standard em USD por milhão. Fast, contexto longo e escritas em cache observadas seguem regras datadas. Outros custos não observados são excluídos."
  ],
  "ja": [
    "キャッシュ書き込み",
    "{n}件はキャッシュ書き込み量が未測定",
    "観測されたキャッシュ書き込みを含み、未観測の料金は除外",
    "100万トークン当たりのStandard API料金（USD）。Fast、長文脈、観測されたキャッシュ書き込みには日付付き規則を適用。その他の未観測料金は除外。"
  ],
  "ru": [
    "Запись кэша",
    "{n} вызовов без измерения записи кэша",
    "Наблюдаемая запись кэша включена; ненаблюдаемые сборы исключены",
    "Цены Standard API в USD за миллион. Fast, длинный контекст и наблюдаемая запись кэша следуют датированным правилам. Прочие ненаблюдаемые сборы исключены."
  ],
  "zh": [
    "缓存写入",
    "{n} 次调用缺少缓存写入测量",
    "已包含观测到的缓存写入；不含未观测费用",
    "每百万 token 的 Standard API 美元价格。Fast、长上下文和已观测缓存写入遵循带日期规则。其他未观测费用不计入。"
  ]
};
for (const [language, values] of Object.entries(CACHE_WRITE_I18N)) {
  Object.assign(PRICING_I18N[language], {
    "dated.cacheWrites": values[0], "dated.unobservedWrites": values[1], "dated.disclaimer": values[2], "dated.copy": values[3],
  });
}

const FORECAST_HISTORY_I18N = {
  "en": [
    "Estimated past consumption",
    "Past consumption is estimated from priced calls and scaled to the observed quota. Unpriced calls make its shape approximate; forecasts use complete periods and recent priced activity."
  ],
  "fr": [
    "Consommation passée estimée",
    "La consommation passée est estimée à partir des appels tarifés et recalée sur le quota observé. Les appels sans tarif rendent sa forme approximative ; la prévision utilise les périodes complètes et l’activité récente tarifée."
  ],
  "de": [
    "Geschätzter bisheriger Verbrauch",
    "Der bisherige Verbrauch wird aus bewertbaren Aufrufen geschätzt und an die beobachtete Quote angepasst. Aufrufe ohne Tarif machen den Verlauf ungenau; die Prognose nutzt vollständige Zeiträume und aktuelle bewertbare Aktivität."
  ],
  "es": [
    "Consumo pasado estimado",
    "El consumo pasado se estima con las llamadas con tarifa y se ajusta a la cuota observada. Las llamadas sin tarifa hacen aproximada la curva; la previsión usa periodos completos y actividad reciente con tarifa."
  ],
  "it": [
    "Consumo passato stimato",
    "Il consumo passato è stimato dalle chiamate con tariffa e adeguato alla quota osservata. Le chiamate senza tariffa rendono la curva approssimativa; la previsione usa periodi completi e attività recente con tariffa."
  ],
  "pt": [
    "Consumo passado estimado",
    "O consumo passado é estimado a partir das chamadas com tarifa e ajustado à quota observada. As chamadas sem tarifa tornam a curva aproximada; a previsão usa períodos completos e atividade recente com tarifa."
  ],
  "ja": [
    "過去の推定消費量",
    "過去の消費は料金が判明した呼び出しから推定し、観測された割り当てに合わせています。料金不明の呼び出しがあるため曲線は概算です。予測には完全な期間と最近の料金既知の利用を使用します。"
  ],
  "ru": [
    "Оценка прошлого расхода",
    "Прошлый расход оценивается по вызовам с известной ценой и приводится к наблюдаемой квоте. Неизвестные тарифы делают форму кривой приблизительной; прогноз использует полные периоды и недавнюю активность с известной ценой."
  ],
  "zh": [
    "估算的历史消耗",
    "历史消耗根据价格已知的调用估算，并按观测额度调整。价格未知的调用使曲线形状近似；预测使用完整周期及近期价格已知的活动。"
  ]
};
for (const [language, [label, description]] of Object.entries(FORECAST_HISTORY_I18N)) {
  PRICING_I18N[language]["dated.forecastPartial"] = description;
  PRICING_I18N[language]["dated.estimatedHistory"] = label;
}

const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);

export function pricingHistoryMarkup(t, model = "all") {
  const rows = PRICING_CATALOG.filter((rate) => model === "all" || rate.model === model)
    .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom) || a.model.localeCompare(b.model) || a.billing.localeCompare(b.billing));
  return `<div class="pricing-history-scroll"><table class="pricing-history-table"><thead><tr><th>${t("pricing.model")}</th><th>${t("dated.period")}</th><th>${t("dated.billing")}</th><th>${t("dated.rates")}</th><th>${t("dated.fast")}</th><th>${t("dated.source")}</th></tr></thead><tbody>${rows.map((rate) => `<tr><th title="${escapeHtml(rate.id)}">${escapeHtml(rate.model)}</th><td>${rate.effectiveFrom}<br>→ ${rate.effectiveTo || t("dated.ongoing")}</td><td>${rate.billing === "api" ? "API · USD" : "Codex · cr"}</td><td>${[rate.standard.input, rate.standard.cached, rate.standard.output].map((value) => value === null ? "—" : value).join(" / ")}${rate.longContextThreshold ? `<small>${t("dated.long")} : ${rate.longContextThreshold.toLocaleString()} · ×2 / ×2 / ×1.5</small>` : ""}</td><td>${rate.fastMultiplier ? `×${rate.fastMultiplier}<small>≥ ${rate.fastFrom}</small>` : "—"}</td><td><span>${t("dated." + rate.evidence)}</span><br>${rate.sources.map((source, i) => `<a href="${escapeHtml(sourceUrl(source))}" target="_blank" rel="noopener noreferrer">${t("dated.source")} ${i + 1}</a>`).join(" · ")}</td></tr>`).join("")}</tbody></table></div>`;
}

export function pricingCatalogLabel(t) {
  const status = catalogStatus();
  return t("dated.catalog", { version: status.version, date: status.verifiedAt }) + (status.reviewDue ? " · " + t("dated.stale") : "");
}

export function createPricingReport(calls, pricing, selection = {}) {
  const api = apiCostOfCalls(calls, pricing);
  const credits = codexCreditsOfCalls(calls);
  const used = new Set([...Object.keys(api.ratesUsed), ...Object.keys(credits.ratesUsed)]);
  return {
    schemaVersion: 1, generatedAt: new Date().toISOString(), catalogVersion: PRICING_CATALOG_VERSION,
    verifiedAt: PRICING_VERIFIED_AT, selection, pricing: structuredClone(pricing), api, credits,
    rates: PRICING_CATALOG.filter((rate) => used.has(rate.id)),
    limitations: ["API-equivalent estimate, not a bill", "Includes observed cache writes; excludes unobserved tools, cache writes and regional fees", "Day boundaries use 00:00 UTC; change-day calls are estimated", "Unrated calls are excluded from sums", "Codex credits always use historical rates"],
  };
}
