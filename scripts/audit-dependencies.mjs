import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export function auditDecision(report) {
  if (!report || report.error || !report.metadata?.vulnerabilities || !report.vulnerabilities) throw new Error("Incomplete dependency audit");
  const blocked = Object.keys(report.vulnerabilities);
  const total = report.metadata.vulnerabilities.total;
  if (!Number.isInteger(total) || total < 0 || total !== blocked.length) throw new Error("Mismatched vulnerability details");
  return { allowed: [], blocked };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.npm_execpath) throw new Error("Run through npm run audit:deps");
  const audit = spawnSync(process.execPath, [process.env.npm_execpath, "audit", "--json"], { encoding: "utf8" });
  if (audit.error || ![0, 1].includes(audit.status)) throw new Error("Dependency audit could not complete");
  const { blocked } = auditDecision(JSON.parse(audit.stdout));
  if (blocked.length) { console.error(`Blocking dependency vulnerabilities: ${blocked.join(", ")}`); process.exitCode = 1; }
  else if (audit.status !== 0) throw new Error("Audit exit code disagrees with the report");
  else console.log("PASS: zero reported vulnerabilities; no dependency exceptions.");
}
