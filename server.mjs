import { timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCodexUsage, usageFingerprint } from "./src/analyzer.mjs";
import { MeshAgent } from "./src/mesh-agent.mjs";
import { MeshHubStore } from "./src/mesh-hub-store.mjs";
import { serializePublicUsage } from "./src/public-usage.mjs";
import { UsageStore } from "./src/usage-store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4317);
const dashboardMode = process.env.DASHBOARD_MODE || "local";
const refreshIntervalMs = Math.max(1_000, Number(process.env.REFRESH_INTERVAL_MS || 60_000));
const snapshotPath = process.env.SNAPSHOT_PATH === ""
  ? null
  : process.env.SNAPSHOT_PATH || path.join(root, ".cache", "usage-snapshot.json");
const meshHubPath = process.env.MESH_HUB_PATH || path.join(root, ".cache", "mesh-hub.json");
const meshAdminToken = process.env.MESH_ADMIN_TOKEN || null;
const maxRequestBytes = Math.max(64 * 1_024, Number(process.env.MESH_MAX_REQUEST_BYTES || 8 * 1_024 * 1_024));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

if (!["local", "hub"].includes(dashboardMode)) throw new Error("DASHBOARD_MODE doit valoir local ou hub.");

let meshAgent = null;
if (dashboardMode === "local" && process.env.MESH_HUB_URL) {
  meshAgent = new MeshAgent({
    hubUrl: process.env.MESH_HUB_URL,
    alias: process.env.MESH_NODE_ALIAS,
    statePath: process.env.MESH_AGENT_STATE_PATH || path.join(root, ".cache", "mesh-agent.json"),
    enrollmentCode: process.env.MESH_ENROLLMENT_CODE || null,
    projectMode: process.env.MESH_PROJECT_MODE || "hash",
    includeTitles: process.env.MESH_INCLUDE_TITLES === "1" || process.env.MESH_INCLUDE_TITLES === "true",
    batchSize: process.env.MESH_BATCH_SIZE,
  });
  await meshAgent.load();
}

const meshHub = dashboardMode === "hub" ? new MeshHubStore({ storePath: meshHubPath }) : null;
if (meshHub) await meshHub.load();

const usageStore = dashboardMode === "local" ? new UsageStore({
  analyze: (previousData) => analyzeCodexUsage({ previousData }),
  fingerprint: usageFingerprint,
  serialize: serializePublicUsage,
  snapshotPath,
  refreshIntervalMs,
  onUpdated: meshAgent ? (data) => meshAgent.sync(data) : null,
}) : null;

function securityHeaders(contentType) {
  return {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  };
}

function send(response, status, body, contentType = "application/json; charset=utf-8") {
  response.writeHead(status, securityHeaders(contentType));
  response.end(body);
}

function sendJson(response, status, value) {
  send(response, status, JSON.stringify(value));
}

async function readJsonBody(request) {
  const declared = Number(request.headers["content-length"] || 0);
  if (declared > maxRequestBytes) {
    const error = new Error("Charge utile trop volumineuse.");
    error.status = 413;
    throw error;
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of request) {
    bytes += chunk.length;
    if (bytes > maxRequestBytes) {
      const error = new Error("Charge utile trop volumineuse.");
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {
    const error = new Error("JSON invalide.");
    error.status = 400;
    throw error;
  }
}

function adminAuthorized(request) {
  if (!meshAdminToken) return false;
  const authorization = String(request.headers.authorization || "");
  const expected = `Bearer ${meshAdminToken}`;
  const left = Buffer.from(authorization);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function serializedUsage(force = false) {
  return dashboardMode === "hub"
    ? serializePublicUsage(meshHub.aggregate())
    : usageStore.getSerializedUsage(force);
}

function healthStatus() {
  if (dashboardMode === "hub") {
    const nodes = meshHub.nodes();
    return { ok: true, ready: true, mode: "hub", nodes: nodes.length, activeNodes: nodes.filter((node) => !node.revokedAt).length };
  }
  return { ...usageStore.status(), mode: "local", mesh: meshAgent?.status() || { enabled: false } };
}

async function routeApi(request, response, url) {
  if (url.pathname === "/api/usage" && request.method === "GET") {
    send(response, 200, await serializedUsage(url.searchParams.get("refresh") === "1"));
    return true;
  }
  if (url.pathname === "/api/health" && request.method === "GET") {
    const status = healthStatus();
    sendJson(response, status.ready ? 200 : 503, status);
    return true;
  }
  if (!meshHub || !url.pathname.startsWith("/api/mesh/")) return false;

  if (url.pathname === "/api/mesh/enroll" && request.method === "POST") {
    sendJson(response, 201, await meshHub.enroll(await readJsonBody(request)));
    return true;
  }
  if (url.pathname === "/api/mesh/ingest" && request.method === "POST") {
    sendJson(response, 202, await meshHub.ingest(await readJsonBody(request)));
    return true;
  }
  if (url.pathname === "/api/mesh/enrollments" && request.method === "POST") {
    if (!adminAuthorized(request)) {
      sendJson(response, 401, { error: "Autorisation administrateur requise.", code: "mesh_admin_required" });
      return true;
    }
    sendJson(response, 201, await meshHub.createEnrollment());
    return true;
  }
  const nodeMatch = url.pathname.match(/^\/api\/mesh\/nodes\/([^/]+)$/);
  if (nodeMatch && request.method === "DELETE") {
    if (!adminAuthorized(request)) {
      sendJson(response, 401, { error: "Autorisation administrateur requise.", code: "mesh_admin_required" });
      return true;
    }
    sendJson(response, 200, await meshHub.revokeNode(decodeURIComponent(nodeMatch[1])));
    return true;
  }
  return false;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://localhost");
    if (await routeApi(request, response, url)) return;
    if (!["GET", "HEAD"].includes(request.method)) {
      send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }
    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = path.resolve(publicDir, relative);
    if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, "index.html")) {
      send(response, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }
    const body = await readFile(filePath);
    send(response, 200, request.method === "HEAD" ? "" : body, mime[path.extname(filePath)] || "application/octet-stream");
  } catch (error) {
    const status = error.status || (error.code === "ENOENT" ? 404 : 500);
    const message = status === 404 ? "Not found" : error.message;
    sendJson(response, status, { error: message, code: error.code || "server_error" });
  }
});

if (usageStore) {
  await usageStore.loadSnapshot();
  usageStore.start();
}

server.listen(port, host, () => {
  console.log(`Local Usage Dashboard for Codex: http://${host}:${port}`);
  if (dashboardMode === "hub") console.log("Mode Mesh Hub — seules les métadonnées signées et minimisées sont acceptées.");
  else console.log(meshAgent ? "Mode local + agent Mesh sortant activé." : "Lecture locale uniquement — aucune donnée n’est envoyée ailleurs.");
});

function shutdown() {
  usageStore?.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
