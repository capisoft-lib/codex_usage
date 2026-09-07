export function desktopAddress(env = process.env, args = []) {
  let explicit = env.DASHBOARD_URL;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--url") {
      explicit = args[++i];
      if (!explicit || explicit.startsWith("--")) throw new Error("--url requires a dashboard URL.");
    } else if (args[i].startsWith("--url=")) {
      explicit = args[i].slice(6);
      if (!explicit) throw new Error("--url requires a dashboard URL.");
    }
  }
  if (explicit !== undefined && explicit !== "") {
    const url = new URL(explicit);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
      throw new Error("Use an HTTP(S) dashboard base URL without credentials, query or fragment.");
    }
    url.pathname = url.pathname.replace(/(?:mini|index)\.html$/, "");
    if (!url.pathname.endsWith("/")) url.pathname += "/";
    return { external: true, url: url.href.replace(/\/$/, ""), baseUrl: url.href };
  }
  const host = env.HOST || "127.0.0.1";
  const port = Number(env.PORT || 4317);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT must be an integer between 1 and 65535.");
  const connectHost = host === "0.0.0.0" ? "127.0.0.1" : host === "::" ? "::1" : host;
  return { host, port, url: `http://${connectHost.includes(":") ? `[${connectHost}]` : connectHost}:${port}` };
}

export function remoteApiUrl(baseUrl, endpoint) {
  if (endpoint !== "capabilities" && !/^usage\?source=(local|centralized)$/.test(endpoint)) {
    throw new Error("Unsupported dashboard request.");
  }
  return new URL(`api/${endpoint}`, baseUrl).href;
}

export function miniPreferences(input = {}) {
  const weekly = input.weekly !== false && input.weekly !== "0";
  const fiveHour = (input.fiveHour !== false && input.fiveHour !== "0") || !weekly;
  const result = { fiveHour: fiveHour ? "1" : "0", weekly: weekly ? "1" : "0" };
  if (["local", "centralized"].includes(input.source)) result.source = input.source;
  if (typeof input.language === "string" && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(input.language)) result.language = input.language;
  if (["green", "blue", "violet", "amber"].includes(input.theme)) result.theme = input.theme;
  if (["system", "12", "24"].includes(input.timeFormat)) result.timeFormat = input.timeFormat;
  return result;
}
