import assert from "node:assert/strict";
import test from "node:test";
import { auditDecision } from "../scripts/audit-dependencies.mjs";

test("audit accepts only a complete report with zero vulnerabilities", () => {
  assert.deepEqual(auditDecision({ metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: {} }), { allowed: [], blocked: [] });
});

test("audit rejects every reported vulnerability without date or development exceptions", () => {
  for (const name of ["braces", "micromatch", "new-production-advisory"]) {
    assert.deepEqual(auditDecision({ metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: { [name]: { name, dev: true } } }), { allowed: [], blocked: [name] });
  }
});

test("audit fails closed on incomplete or inconsistent reports", () => {
  for (const report of [null, {}, { error: {} },
    { metadata: { vulnerabilities: { total: 1 } }, vulnerabilities: {} },
    { metadata: { vulnerabilities: { total: 0 } }, vulnerabilities: { braces: {} } },
    { metadata: { vulnerabilities: {} }, vulnerabilities: {} }]) assert.throws(() => auditDecision(report));
});
