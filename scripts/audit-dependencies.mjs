import { spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

// The upstream project has no patched release for this development-only glob
// parser. This narrow exception expires automatically; all other alerts fail.
export const BRACES_EXCEPTION = Object.freeze({
  url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm",
  version: "3.0.3", expiresAt: "2026-10-23T00:00:00Z",
});

export function auditDecision(report, lock, asOf = new Date()) {
  if (!report || report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities || !lock?.packages) throw new Error("Incomplete dependency audit");
  const vulnerabilities = report.vulnerabilities;
  const exempt = (name, visiting = new Set()) => {
    const item = vulnerabilities[name];
    if (!item || visiting.has(name) || !item.nodes?.length || !item.via?.length) return false;
    if (item.nodes.some(node => lock.packages[node]?.dev !== true)) return false;
    const next = new Set([...visiting, name]);
    return item.via.every(via => typeof via === "string" ? exempt(via, next) :
      item.name === "braces" && via.name === "braces" && via.url === BRACES_EXCEPTION.url &&
      item.nodes.every(node => lock.packages[node].version === BRACES_EXCEPTION.version) &&
      Number.isFinite(+asOf) && +asOf < Date.parse(BRACES_EXCEPTION.expiresAt));
  };
  const allowed = [], blocked = [];
  for (const name of Object.keys(vulnerabilities)) (exempt(name) ? allowed : blocked).push(name);
  // Unknown/mismatched audit schema must never yield a false clean result.
  if (report.metadata.vulnerabilities.total > 0 && !Object.keys(vulnerabilities).length) throw new Error("Missing vulnerability details");
  return { allowed, blocked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.npm_execpath) throw new Error("Run through npm run audit:deps");
  const audit = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], { encoding: "utf8" });
  if (audit.error || ![0, 1].includes(audit.status)) throw new Error("Dependency audit could not complete");
  const report = JSON.parse(audit.stdout);
  const lock = JSON.parse(await readFile("package-lock.json", "utf8"));
  const { allowed, blocked } = auditDecision(report, lock);
  if (allowed.length) console.warn(`Temporary development-only exception: ${BRACES_EXCEPTION.url}; expires ${BRACES_EXCEPTION.expiresAt}; packages: ${allowed.join(", ")}`);
  if (blocked.length) { console.error(`Blocking dependency vulnerabilities: ${blocked.join(", ")}`); process.exitCode = 1; }
  else console.log(allowed.length ? "PASS: no vulnerabilities outside the explicit temporary development exception." : "PASS: zero reported vulnerabilities.");
}
