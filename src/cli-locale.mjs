const LANGUAGE_NAMES = {
  de: {
    agentActive: (alias) => `Codex-Sammler für ${alias} aktiv. Es wird keine lokale Benutzeroberfläche bereitgestellt.`,
    agentNotAssociated: "Dieser Rechner ist noch nicht zugeordnet. Kopieren Sie den auf der Seite /admin erzeugten Befehl.",
    bundleBuilt: (directory, count) => `UI-Bundle in ${directory} erstellt (${count} Dateien).`,
    dashboardAddressInUse: (url) => `Öffnen Sie es hier: ${url}\n\nFalls die Seite nicht geöffnet wird, beenden Sie den Prozess, der diese Adresse verwendet, und versuchen Sie es erneut.`,
    dashboardAlreadyRunning: "Dashboard läuft bereits!",
    dashboardReady: (url) => `Lokales Nutzungs-Dashboard für Codex: ${url}`,
    dashboardStartFailed: (error) => `Codex Usage konnte nicht gestartet werden: ${error}`,
    localOnly: "Nur lokale Daten — nichts wird an andere Stellen gesendet.",
    meshEnabled: "Lokaler Modus + ausgehende Mesh-Sammlung aktiviert.",
    meshHub: "Mesh-Hub-Modus — nur signierte und minimierte Metadaten werden akzeptiert.",
    meshStorageIgnored: (error) => `Mesh-Speicher ignoriert: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh synchronisiert: ${accepted} geänderte Sitzungen, ${removals} Löschungen.`,
    oneShotComplete: (alias) => `Einmalige Synchronisierung für ${alias} abgeschlossen.`,
    refreshed: (ms, sessions) => `Daten aktualisiert in ${ms} ms (${sessions} Sitzungen).`,
    refreshFailed: (error) => `Aktualisierung fehlgeschlagen: ${error}`,
    secondarySyncFailed: (error) => `Sekundäre Synchronisierung fehlgeschlagen: ${error}`,
    snapshotIgnored: (error) => `Snapshot ignoriert: ${error}`,
  },
  en: {
    agentActive: (alias) => `Codex collector active for ${alias}. No local interface is being served.`,
    agentNotAssociated: "This machine is not associated yet. Copy the command generated on the /admin page.",
    bundleBuilt: (directory, count) => `UI bundle generated in ${directory} (${count} files).`,
    dashboardAddressInUse: (url) => `Open it here: ${url}\n\nIf the page does not open, stop the process using this address and try again.`,
    dashboardAlreadyRunning: "Dashboard already running!",
    dashboardReady: (url) => `Local Usage Dashboard for Codex: ${url}`,
    dashboardStartFailed: (error) => `Codex Usage could not start: ${error}`,
    localOnly: "Local-only reading — no data is sent elsewhere.",
    meshEnabled: "Local mode + outbound Mesh collector enabled.",
    meshHub: "Mesh Hub mode — only signed, minimized metadata is accepted.",
    meshStorageIgnored: (error) => `Mesh storage ignored: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh synchronized: ${accepted} changed sessions, ${removals} removals.`,
    oneShotComplete: (alias) => `One-time synchronization completed for ${alias}.`,
    refreshed: (ms, sessions) => `Data refreshed in ${ms} ms (${sessions} sessions).`,
    refreshFailed: (error) => `Refresh failed: ${error}`,
    secondarySyncFailed: (error) => `Secondary synchronization failed: ${error}`,
    snapshotIgnored: (error) => `Snapshot ignored: ${error}`,
  },
  es: {
    agentActive: (alias) => `Recopilador de Codex activo para ${alias}. No se sirve ninguna interfaz local.`,
    agentNotAssociated: "Este equipo aún no está asociado. Copie el comando generado en la página /admin.",
    bundleBuilt: (directory, count) => `Paquete de UI generado en ${directory} (${count} archivos).`,
    dashboardAddressInUse: (url) => `Ábralo aquí: ${url}\n\nSi la página no se abre, detenga el proceso que utiliza esta dirección e inténtelo de nuevo.`,
    dashboardAlreadyRunning: "¡El panel ya está en ejecución!",
    dashboardReady: (url) => `Panel de uso local de Codex: ${url}`,
    dashboardStartFailed: (error) => `No se pudo iniciar Codex Usage: ${error}`,
    localOnly: "Lectura solo local — no se envían datos a otros lugares.",
    meshEnabled: "Modo local + recopilador Mesh saliente activado.",
    meshHub: "Modo Mesh Hub — solo se aceptan metadatos firmados y minimizados.",
    meshStorageIgnored: (error) => `Almacenamiento Mesh ignorado: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh sincronizado: ${accepted} sesiones modificadas, ${removals} eliminaciones.`,
    oneShotComplete: (alias) => `Sincronización única completada para ${alias}.`,
    refreshed: (ms, sessions) => `Datos actualizados en ${ms} ms (${sessions} sesiones).`,
    refreshFailed: (error) => `Error de actualización: ${error}`,
    secondarySyncFailed: (error) => `Error de sincronización secundaria: ${error}`,
    snapshotIgnored: (error) => `Instantánea ignorada: ${error}`,
  },
  fr: {
    agentActive: (alias) => `Collecteur Codex actif pour ${alias}. Aucune interface locale n’est servie.`,
    agentNotAssociated: "Cette machine n’est pas encore associée. Copiez la commande générée dans la page /admin.",
    bundleBuilt: (directory, count) => `Bundle UI généré dans ${directory} (${count} fichiers).`,
    dashboardAddressInUse: (url) => `Ouvrez-le ici : ${url}\n\nSi la page ne s’ouvre pas, arrêtez le processus qui utilise cette adresse, puis réessayez.`,
    dashboardAlreadyRunning: "Le tableau de bord est déjà en cours d’exécution !",
    dashboardReady: (url) => `Tableau de bord d’utilisation locale de Codex : ${url}`,
    dashboardStartFailed: (error) => `Impossible de démarrer Codex Usage : ${error}`,
    localOnly: "Lecture locale uniquement — aucune donnée n’est envoyée ailleurs.",
    meshEnabled: "Mode local + collecteur Mesh sortant activé.",
    meshHub: "Mode Mesh Hub — seules les métadonnées signées et minimisées sont acceptées.",
    meshStorageIgnored: (error) => `Stockage Mesh ignoré : ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh synchronisé : ${accepted} session(s) modifiée(s), ${removals} suppression(s).`,
    oneShotComplete: (alias) => `Synchronisation ponctuelle terminée pour ${alias}.`,
    refreshed: (ms, sessions) => `Données actualisées en ${ms} ms (${sessions} sessions).`,
    refreshFailed: (error) => `Actualisation impossible : ${error}`,
    secondarySyncFailed: (error) => `Synchronisation secondaire impossible : ${error}`,
    snapshotIgnored: (error) => `Instantané ignoré : ${error}`,
  },
  it: {
    agentActive: (alias) => `Raccoglitore Codex attivo per ${alias}. Non viene servita alcuna interfaccia locale.`,
    agentNotAssociated: "Questa macchina non è ancora associata. Copia il comando generato nella pagina /admin.",
    bundleBuilt: (directory, count) => `Bundle UI generato in ${directory} (${count} file).`,
    dashboardAddressInUse: (url) => `Aprila qui: ${url}\n\nSe la pagina non si apre, arresta il processo che utilizza questo indirizzo e riprova.`,
    dashboardAlreadyRunning: "La dashboard è già in esecuzione!",
    dashboardReady: (url) => `Dashboard di utilizzo locale di Codex: ${url}`,
    dashboardStartFailed: (error) => `Impossibile avviare Codex Usage: ${error}`,
    localOnly: "Lettura solo locale — nessun dato viene inviato altrove.",
    meshEnabled: "Modalità locale + raccolta Mesh in uscita attivata.",
    meshHub: "Modalità Mesh Hub — sono accettati solo metadati firmati e minimizzati.",
    meshStorageIgnored: (error) => `Archiviazione Mesh ignorata: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh sincronizzato: ${accepted} sessioni modificate, ${removals} eliminazioni.`,
    oneShotComplete: (alias) => `Sincronizzazione singola completata per ${alias}.`,
    refreshed: (ms, sessions) => `Dati aggiornati in ${ms} ms (${sessions} sessioni).`,
    refreshFailed: (error) => `Aggiornamento non riuscito: ${error}`,
    secondarySyncFailed: (error) => `Sincronizzazione secondaria non riuscita: ${error}`,
    snapshotIgnored: (error) => `Snapshot ignorato: ${error}`,
  },
  ja: {
    agentActive: (alias) => `${alias} の Codex コレクターが稼働中です。ローカルインターフェイスは提供されません。`,
    agentNotAssociated: "このマシンはまだ関連付けられていません。/admin ページで生成されたコマンドをコピーしてください。",
    bundleBuilt: (directory, count) => `UIバンドルを${directory}に生成しました（${count}ファイル）。`,
    dashboardAddressInUse: (url) => `こちらから開いてください: ${url}\n\nページが開かない場合は、このアドレスを使用しているプロセスを停止してから、もう一度お試しください。`,
    dashboardAlreadyRunning: "ダッシュボードはすでに実行中です！",
    dashboardReady: (url) => `Codex ローカル使用状況ダッシュボード: ${url}`,
    dashboardStartFailed: (error) => `Codex Usage を起動できませんでした: ${error}`,
    localOnly: "ローカルのみ — データは外部に送信されません。",
    meshEnabled: "ローカルモード + Mesh送信コレクターが有効です。",
    meshHub: "Mesh Hubモード — 署名済みで最小化されたメタデータのみ受け付けます。",
    meshStorageIgnored: (error) => `Mesh ストレージを無視しました: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh を同期しました: ${accepted}件のセッションを変更、${removals}件を削除。`,
    oneShotComplete: (alias) => `${alias} の1回限りの同期が完了しました。`,
    refreshed: (ms, sessions) => `${ms} msでデータを更新しました（${sessions}セッション）。`,
    refreshFailed: (error) => `更新に失敗しました: ${error}`,
    secondarySyncFailed: (error) => `二次同期に失敗しました: ${error}`,
    snapshotIgnored: (error) => `スナップショットを無視しました: ${error}`,
  },
  pt: {
    agentActive: (alias) => `Coletor Codex ativo para ${alias}. Nenhuma interface local está a ser disponibilizada.`,
    agentNotAssociated: "Este computador ainda não está associado. Copie o comando gerado na página /admin.",
    bundleBuilt: (directory, count) => `Pacote de UI gerado em ${directory} (${count} ficheiros).`,
    dashboardAddressInUse: (url) => `Abra-o aqui: ${url}\n\nSe a página não abrir, termine o processo que utiliza este endereço e tente novamente.`,
    dashboardAlreadyRunning: "O painel já está em execução!",
    dashboardReady: (url) => `Painel de utilização local do Codex: ${url}`,
    dashboardStartFailed: (error) => `Não foi possível iniciar o Codex Usage: ${error}`,
    localOnly: "Leitura apenas local — nenhum dado é enviado para outro lugar.",
    meshEnabled: "Modo local + coletor Mesh de saída ativado.",
    meshHub: "Modo Mesh Hub — apenas metadados assinados e minimizados são aceitos.",
    meshStorageIgnored: (error) => `Armazenamento Mesh ignorado: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh sincronizado: ${accepted} sessões alteradas, ${removals} remoções.`,
    oneShotComplete: (alias) => `Sincronização única concluída para ${alias}.`,
    refreshed: (ms, sessions) => `Dados atualizados em ${ms} ms (${sessions} sessões).`,
    refreshFailed: (error) => `Falha ao atualizar: ${error}`,
    secondarySyncFailed: (error) => `Falha na sincronização secundária: ${error}`,
    snapshotIgnored: (error) => `Instantâneo ignorado: ${error}`,
  },
  ru: {
    agentActive: (alias) => `Сборщик Codex активен для ${alias}. Локальный интерфейс не предоставляется.`,
    agentNotAssociated: "Этот компьютер ещё не привязан. Скопируйте команду, созданную на странице /admin.",
    bundleBuilt: (directory, count) => `UI-пакет создан в ${directory} (файлов: ${count}).`,
    dashboardAddressInUse: (url) => `Откройте её здесь: ${url}\n\nЕсли страница не открывается, остановите процесс, использующий этот адрес, и повторите попытку.`,
    dashboardAlreadyRunning: "Панель уже запущена!",
    dashboardReady: (url) => `Локальная панель использования Codex: ${url}`,
    dashboardStartFailed: (error) => `Не удалось запустить Codex Usage: ${error}`,
    localOnly: "Только локальное чтение — данные никуда не отправляются.",
    meshEnabled: "Локальный режим + исходящий сборщик Mesh включён.",
    meshHub: "Режим Mesh Hub — принимаются только подписанные минимизированные метаданные.",
    meshStorageIgnored: (error) => `Хранилище Mesh проигнорировано: ${error}`,
    meshSynchronized: (accepted, removals) => `Mesh синхронизирован: изменено сеансов — ${accepted}, удалено — ${removals}.`,
    oneShotComplete: (alias) => `Однократная синхронизация для ${alias} завершена.`,
    refreshed: (ms, sessions) => `Данные обновлены за ${ms} мс (сеансов: ${sessions}).`,
    refreshFailed: (error) => `Не удалось обновить данные: ${error}`,
    secondarySyncFailed: (error) => `Не удалось выполнить вторичную синхронизацию: ${error}`,
    snapshotIgnored: (error) => `Снимок проигнорирован: ${error}`,
  },
  zh: {
    agentActive: (alias) => `${alias} 的 Codex 收集器正在运行。不提供本地界面。`,
    agentNotAssociated: "此计算机尚未关联。请复制 /admin 页面生成的命令。",
    bundleBuilt: (directory, count) => `UI 包已生成到 ${directory}（${count} 个文件）。`,
    dashboardAddressInUse: (url) => `在此打开：${url}\n\n如果页面无法打开，请停止占用此地址的进程，然后重试。`,
    dashboardAlreadyRunning: "仪表板已在运行！",
    dashboardReady: (url) => `Codex 本地用量仪表板：${url}`,
    dashboardStartFailed: (error) => `无法启动 Codex Usage：${error}`,
    localOnly: "仅本地读取 — 不会向其他位置发送数据。",
    meshEnabled: "本地模式 + 已启用 Mesh 出站收集器。",
    meshHub: "Mesh Hub 模式 — 仅接受已签名且最小化的元数据。",
    meshStorageIgnored: (error) => `已忽略 Mesh 存储：${error}`,
    meshSynchronized: (accepted, removals) => `Mesh 已同步：更改 ${accepted} 个会话，删除 ${removals} 个会话。`,
    oneShotComplete: (alias) => `${alias} 的单次同步已完成。`,
    refreshed: (ms, sessions) => `数据已在 ${ms} ms 内更新（${sessions} 个会话）。`,
    refreshFailed: (error) => `更新失败：${error}`,
    secondarySyncFailed: (error) => `二次同步失败：${error}`,
    snapshotIgnored: (error) => `已忽略快照：${error}`,
  },
};

const NEUTRAL_LOCALE = /^(?:c|posix)(?:$|[._@-])/i;
const UNDEFINED_LOCALE = /^und(?:$|[._@-])/i;

export const CLI_LANGUAGES = Object.freeze(Object.keys(LANGUAGE_NAMES));
export const CLI_MESSAGE_KEYS = Object.freeze(Object.keys(LANGUAGE_NAMES.en));

function nonEmpty(value) {
  const normalized = String(value || "").trim();
  return normalized || null;
}

function supportedLanguage(value) {
  const code = nonEmpty(value)?.toLowerCase().split(/[._@-]/)[0];
  return code && Object.hasOwn(LANGUAGE_NAMES, code) ? code : null;
}

function systemLocale() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale;
  } catch {
    return "en";
  }
}

export function resolveCliLanguage({ env = process.env, defaultLocale = systemLocale() } = {}) {
  const activeLocale = [env.LC_ALL, env.LC_MESSAGES, env.LANG]
    .map(nonEmpty)
    .find((value) => value && !UNDEFINED_LOCALE.test(value)) || nonEmpty(defaultLocale) || "en";

  // A C/POSIX locale explicitly disables translated messages. LANGUAGE is a
  // priority list only after localization has been enabled by the base locale.
  if (NEUTRAL_LOCALE.test(activeLocale)) return "en";

  for (const preference of String(env.LANGUAGE || "").split(":")) {
    const candidate = nonEmpty(preference);
    if (!candidate || UNDEFINED_LOCALE.test(candidate)) continue;
    if (NEUTRAL_LOCALE.test(candidate)) return "en";
    const language = supportedLanguage(candidate);
    if (language) return language;
  }

  return supportedLanguage(activeLocale) || "en";
}

export function cliTextForLanguage(language, key, ...args) {
  const messages = LANGUAGE_NAMES[supportedLanguage(language)] || LANGUAGE_NAMES.en;
  let value = key;
  if (Object.hasOwn(messages, key)) value = messages[key];
  else if (Object.hasOwn(LANGUAGE_NAMES.en, key)) value = LANGUAGE_NAMES.en[key];
  return typeof value === "function" ? value(...args) : value;
}

export function cliText(key, ...args) {
  return cliTextForLanguage(resolveCliLanguage(), key, ...args);
}
