import assert from "node:assert/strict";
import test from "node:test";
import { auditDecision, BRACES_EXCEPTION } from "../scripts/audit-dependencies.mjs";
const now = new Date("2026-10-09T12:00:00Z");
const fixture = () => ({
  report: { metadata: { vulnerabilities: { total: 2 } }, vulnerabilities: {
    braces: { name: "braces", nodes: ["node_modules/braces"], via: [{ name: "braces", url: BRACES_EXCEPTION.url }] },
    micromatch: { name: "micromatch", nodes: ["node_modules/micromatch"], via: ["braces"] },
  } },
  lock: { packages: { "node_modules/braces": { version: "3.0.3", dev: true }, "node_modules/micromatch": { version: "4.0.8", dev: true } } },
});
test("audit permits only the documented dev-only unpatched advisory before expiry", () => {
  const { report, lock } = fixture();
  assert.deepEqual(auditDecision(report, lock, now), { allowed: ["braces", "micromatch"], blocked: [] });
  assert.deepEqual(auditDecision(report, lock, new Date(BRACES_EXCEPTION.expiresAt)).blocked, ["braces", "micromatch"]);
});
test("audit still rejects production packages, unknown advisories, versions and paths", () => {
  for (const variation of ["prod", "different-advisory", "additional-advisory", "version", "missing-path", "prod-parent"]) {
    const { report, lock } = fixture();
    if (variation === "prod") lock.packages["node_modules/braces"].dev = false;
    if (variation === "different-advisory") report.vulnerabilities.braces.via[0].url = "https://example.test/new";
    if (variation === "additional-advisory") report.vulnerabilities.braces.via.push({ name: "braces", url: "https://example.test/new" });
    if (variation === "version") lock.packages["node_modules/braces"].version = "3.0.4";
    if (variation === "missing-path") delete lock.packages["node_modules/braces"];
    if (variation === "prod-parent") lock.packages["node_modules/micromatch"].dev = false;
    assert.ok(auditDecision(report, lock, now).blocked.length, variation);
  }
});
test("audit rejects failed or incomplete results and dependency cycles", () => {
  const { report, lock } = fixture();
  assert.throws(() => auditDecision({ error: {} }, lock, now));
  assert.throws(() => auditDecision({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} }, lock, now));
  report.vulnerabilities.braces.via = ["micromatch"];
  assert.deepEqual(auditDecision(report, lock, now).blocked, ["braces", "micromatch"]);
});
