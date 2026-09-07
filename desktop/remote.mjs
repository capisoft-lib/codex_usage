import { app, ipcMain, shell } from "electron";
import { createHash, randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { remoteApiUrl } from "../src/desktop-options.mjs";
import { MeshAgent, normalizeMeshHubUrl } from "../src/mesh-agent.mjs";

// A dedicated identity keeps signed read sequences independent of the sender.
export async function createRemoteDashboard({ baseUrl, miniFile, getMiniWindow }) {
  const directory = path.join(app.getPath("userData"), "desktop-mesh", createHash("sha256").update(baseUrl).digest("hex"));
  const configPath = path.join(directory, "connection.json");
  const localUrl = pathToFileURL(miniFile).href;
  let reader;
  let associating = false;
  const meshFetch = (url, options) => fetch(url, { ...options, redirect: "error", signal: AbortSignal.timeout(10_000) });
  try {
    const config = JSON.parse(await readFile(configPath, "utf8"));
    if (!/^[a-f0-9-]+\.json$/.test(config.identity)) throw new Error("Invalid desktop identity");
    reader = new MeshAgent({ hubUrl: config.hubUrl, alias: "Quota desktop", statePath: path.join(directory, config.identity), fetchImpl: meshFetch });
    await reader.load();
  } catch (error) {
    if (error.code !== "ENOENT") console.error("Desktop association could not be loaded; associate again.");
    reader = null;
  }
  function trusted(event) {
    const window = getMiniWindow();
    return window && event.sender === window.webContents && event.senderFrame === window.webContents.mainFrame
      && event.senderFrame.url.split("?")[0] === localUrl;
  }
  const openDashboard = () => shell.openExternal(baseUrl);
  ipcMain.handle("mini:configuration-size", (event, expanded) => {
    if (!trusted(event)) throw new Error("Untrusted window");
    const window = getMiniWindow();
    window.setContentSize(window.getContentSize()[0], expanded === true ? 540 : 250);
  });
  ipcMain.handle("mini:open-admin", (event) => {
    if (!trusted(event)) throw new Error("Untrusted window");
    return shell.openExternal(new URL("admin", baseUrl).href);
  });
  ipcMain.handle("mini:associate", async (event, hubUrl, code) => {
    if (!trusted(event)) throw new Error("Untrusted window");
    if (associating) throw new Error("Association already in progress");
    const hub = new URL(normalizeMeshHubUrl(hubUrl));
    if (hub.protocol !== "https:" && !["localhost", "127.0.0.1", "[::1]"].includes(hub.hostname)) throw new Error("HTTPS is required outside localhost");
    if (typeof code !== "string" || !code.trim() || code.length > 1024) throw new Error("Invalid association code");
    associating = true;
    try {
      const identity = `${randomUUID()}.json`;
      const candidate = new MeshAgent({ hubUrl: hub.origin, alias: "Quota desktop", enrollmentCode: code.trim(), statePath: path.join(directory, identity), fetchImpl: meshFetch });
      await candidate.load();
      await candidate.enroll();
      await mkdir(directory, { recursive: true });
      const temporary = `${configPath}.tmp`;
      await writeFile(temporary, JSON.stringify({ hubUrl: hub.origin, identity }), { mode: 0o600 });
      await rename(temporary, configPath);
      reader = candidate;
      return { ok: true };
    } finally { associating = false; }
  });
  ipcMain.handle("mini:request", async (event, endpoint) => {
    if (!trusted(event)) throw new Error("Untrusted window");
    const url = remoteApiUrl(baseUrl, endpoint);
    try {
      let data;
      if (reader) {
        if (endpoint === "capabilities") return { ok: true, data: { apiVersion: 1, sources: ["centralized"], defaultSource: "centralized" } };
        data = await reader.centralizedUsage();
      } else {
        const response = await fetch(url, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(10_000) });
        if ([301, 302, 303, 307, 308, 401, 403].includes(response.status)) return { ok: false, associationRequired: true };
        if (!response.ok) return { ok: false, status: response.status };
        if (!response.headers.get("content-type")?.includes("application/json")) return { ok: false, associationRequired: true };
        data = await response.json();
      }
      if (!data || typeof data !== "object" || Array.isArray(data)) return { ok: false };
      // Only quota metadata crosses the renderer bridge, never conversations.
      return { ok: true, data: endpoint === "capabilities" ? data : {
        theme: ["green", "blue", "violet", "amber"].includes(data.theme) ? data.theme : null,
        generatedAt: data.generatedAt, weeklyQuota: data.weeklyQuota,
        weeklyQuotaHistory: data.weeklyQuotaHistory, fiveHourQuota: data.fiveHourQuota,
      } };
    } catch (error) { return { ok: false, associationRequired: [401, 403].includes(error.status) }; }
  });
  return { openDashboard, close: () => {
    for (const channel of ["mini:request", "mini:open-admin", "mini:associate", "mini:configuration-size"]) ipcMain.removeHandler(channel);
  } };
}
