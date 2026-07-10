import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCodexUsage, usageFingerprint } from "./src/analyzer.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, "public");
const host = process.env.HOST || "127.0.0.1";
const port = Number(process.env.PORT || 4317);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

let cache = { fingerprint: null, data: null, checkedAt: 0 };

async function getUsage(force = false) {
  const now = Date.now();
  if (!force && cache.data && now - cache.checkedAt < 1500) return cache.data;
  const fingerprint = await usageFingerprint();
  cache.checkedAt = now;
  if (!force && cache.data && fingerprint === cache.fingerprint) return cache.data;
  const data = await analyzeCodexUsage();
  cache = { fingerprint, data, checkedAt: Date.now() };
  return data;
}

function send(response, status, body, contentType) {
  response.writeHead(status, {
    "Content-Type": contentType,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(body);
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://${request.headers.host || `${host}:${port}`}`);
    if (url.pathname === "/api/usage") {
      const data = await getUsage(url.searchParams.get("refresh") === "1");
      send(response, 200, JSON.stringify(data), "application/json; charset=utf-8");
      return;
    }
    if (url.pathname === "/api/health") {
      send(response, 200, JSON.stringify({ ok: true }), "application/json; charset=utf-8");
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

server.listen(port, host, () => {
  console.log(`Codex Usage Dashboard: http://${host}:${port}`);
  console.log("Lecture locale uniquement — aucune donnée n’est envoyée ailleurs.");
});
