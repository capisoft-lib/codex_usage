import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCodexUsage, usageFingerprint } from "./src/analyzer.mjs";
import { serializePublicUsage } from "./src/public-usage.mjs";
import { UsageStore } from "./src/usage-store.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4317);
const refreshIntervalMs = Math.max(1_000, Number(process.env.REFRESH_INTERVAL_MS || 60_000));
const snapshotPath = process.env.SNAPSHOT_PATH === ""
  ? null
  : process.env.SNAPSHOT_PATH || path.join(root, ".cache", "usage-snapshot.json");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

const usageStore = new UsageStore({
  analyze: (previousData) => analyzeCodexUsage({ previousData }),
  fingerprint: usageFingerprint,
  serialize: serializePublicUsage,
  snapshotPath,
  refreshIntervalMs,
});

function send(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    "Cross-Origin-Resource-Policy": "same-origin",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    if (!['GET', 'HEAD'].includes(request.method)) {
      send(response, 405, "Method not allowed", "text/plain; charset=utf-8");
      return;
    }
    const url = new URL(request.url, "http://localhost");
    if (url.pathname === "/api/usage") {
      const body = await usageStore.getSerializedUsage(url.searchParams.get("refresh") === "1");
      send(response, 200, body, "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/health") {
      const status = usageStore.status();
      send(response, status.ready ? 200 : 503, JSON.stringify(status), "application/json; charset=utf-8");
      return;
    }

    const relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
    const filePath = path.resolve(publicDir, relative);
    if (!filePath.startsWith(`${publicDir}${path.sep}`) && filePath !== path.join(publicDir, "index.html")) {
      send(response, 403, "Forbidden", "text/plain; charset=utf-8");
      return;
    }
    const body = await readFile(filePath);
    send(response, 200, body, mime[path.extname(filePath)] || "application/octet-stream");
  } catch (error) {
    const status = error.code === "ENOENT" ? 404 : 500;
    send(response, status, status === 404 ? "Not found" : JSON.stringify({ error: error.message }), status === 404 ? "text/plain; charset=utf-8" : "application/json; charset=utf-8");
  }
});

await usageStore.loadSnapshot();
usageStore.start();

server.listen(port, host, () => {
  console.log(`Codex Usage Dashboard: http://${host}:${port}`);
  console.log("Lecture locale uniquement — aucune donnée n’est envoyée ailleurs.");
  console.log(`Actualisation en arrière-plan toutes les ${refreshIntervalMs / 1000} s.`);
});

function shutdown() {
  usageStore.stop();
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
