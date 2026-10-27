import assert from "node:assert/strict";
import test from "node:test";
import { normalizeAccountQuotas, applyAccountQuotas } from "../src/account-quota.mjs";
import { sanitizeUsageForMesh } from "../src/mesh-privacy.mjs";
import { validateSyncPayload } from "../src/mesh-protocol.mjs";
import { normalizeQuotaPeriods } from "../public/quota-periods.js";
import { availableResetDeadlines, validResetDeadlineMetadata } from "../public/reset-deadlines.js";
import { forecastGoalValue } from "../public/forecast-goals.js";

const observedAt = "2026-10-27T20:00:00.000Z";
const expiresAt = "2026-10-29T19:04:04.000Z";
const credit = { id: "private-credit", title: "private-title", description: "private-description", resetType: "codexRateLimits", status: "available", expiresAt: Date.parse(expiresAt) / 1000 };
const response = { rateLimits: { limitId: "codex", planType: "pro", primary: { usedPercent: 47, windowDurationMins: 10080, resetsAt: Date.parse("2026-11-02T06:08:16Z") / 1000 } },
  rateLimitResetCredits: { availableCount: 2, credits: [credit, { ...credit, id: "another-private-credit" }] } };
const account = () => normalizeAccountQuotas(response, observedAt);
const metadata = { resetDeadlines: [{ expiresAt, count: 2 }], resetDeadlinesObservedAt: observedAt };

test("account expiry comes from available Codex credits, grouped without private fields", () => {
  const extras = [{ ...credit, status: "used" }, { ...credit, status: "expired" }, { ...credit, resetType: "other" }, { ...credit, expiresAt: Date.parse(observedAt) / 1000 }, { ...credit, expiresAt: Infinity }];
  const result = normalizeAccountQuotas({ ...response, rateLimitResetCredits: { ...response.rateLimitResetCredits, credits: [...response.rateLimitResetCredits.credits, ...extras] } }, observedAt);
  assert.deepEqual(result.weeklyQuota.resetDeadlines, metadata.resetDeadlines);
  assert.doesNotMatch(JSON.stringify(result), /private-/);
  assert.equal(result.weeklyQuota.resetDeadlinesObservedAt, observedAt);
  assert.deepEqual(normalizeAccountQuotas({ ...response, rateLimitResetCredits: { availableCount: 0 } }, observedAt).weeklyQuota.resetDeadlines, []);
  assert.equal(normalizeAccountQuotas({ ...response, rateLimitResetCredits: { availableCount: 2 } }, observedAt).weeklyQuota.resetDeadlines, null);
});

test("automatic deadline survives account enrichment, public filtering and Mesh validation", () => {
  const enriched = applyAccountQuotas({ generatedAt: observedAt, sessions: [], weeklyQuotaHistory: [] }, account());
  const mesh = sanitizeUsageForMesh(enriched, { projectMode: "hash", includeTitles: false, projectSalt: "test" });
  assert.deepEqual(mesh.quota.resetDeadlines, metadata.resetDeadlines);
  assert.deepEqual(mesh.quotaHistory[0].resetDeadlines, metadata.resetDeadlines);
  const payload = { kind: "sync", snapshotVersion: 1, generatedAt: observedAt, privacy: mesh.privacy, quota: mesh.quota, quotaHistory: mesh.quotaHistory, upserts: [], removals: [] };
  assert.doesNotThrow(() => validateSyncPayload(payload));
  for (const invalid of [{ ...metadata.resetDeadlines[0], id: "private" }, { expiresAt, count: -1 }, { expiresAt: "bad", count: 1 }]) {
    assert.throws(() => validateSyncPayload({ ...payload, quota: { ...mesh.quota, resetDeadlines: [invalid] } }), /Quota/);
  }
  const failed = applyAccountQuotas(enriched, null);
  assert.equal(failed.weeklyQuota.resetDeadlines, null);
  assert.equal(failed.weeklyQuotaHistory[0].resetDeadlines, null);
});

test("mixed collector versions keep the newest account reading and honor explicit clearing", () => {
  const base = account().weeklyQuota;
  const legacy = { ...base, observedAt: "2026-10-27T20:05:00Z", usedPercent: 48, nodeId: "older-agent" };
  delete legacy.resetDeadlines;
  delete legacy.resetDeadlinesObservedAt;
  const period = normalizeQuotaPeriods({ weeklyQuota: legacy, weeklyQuotaHistory: [base] })[0];
  assert.equal(period.usedPercent, 48);
  assert.deepEqual(period.resetDeadlines, metadata.resetDeadlines);
  // A merged observation's newer usage time must never rejuvenate its expiry reading.
  const consumed = { ...base, resetDeadlines: [], resetDeadlinesObservedAt: "2026-10-27T20:03:00Z" };
  assert.deepEqual(normalizeQuotaPeriods({ weeklyQuota: period, weeklyQuotaHistory: [consumed] })[0].resetDeadlines, []);
  const unknown = { ...consumed, resetDeadlines: null };
  assert.equal(normalizeQuotaPeriods({ weeklyQuota: period, weeklyQuotaHistory: [unknown] })[0].resetDeadlines, null);
  assert.equal(validResetDeadlineMetadata(legacy), true);
});

test("automatic markers use live expiry times and stop after expiry or credit consumption", () => {
  const quota = account().weeklyQuota;
  assert.deepEqual(availableResetDeadlines(quota, Date.parse(observedAt)), metadata.resetDeadlines);
  assert.deepEqual(availableResetDeadlines(quota, Date.parse(expiresAt)), []);
  assert.deepEqual(availableResetDeadlines({ ...quota, resetDeadlines: [] }, Date.parse(observedAt)), []);
  const forecast = { status: "ready", rangeStart: "2026-10-26T00:00:00Z", rangeEnd: "2026-11-02T00:00:00Z",
    actual: [{ timestamp: observedAt, percent: 47 }], projected: [{ timestamp: observedAt, percent: 47 }, { timestamp: expiresAt, percent: 164.5 }, { timestamp: "2026-11-02T00:00:00Z", percent: 350 }] };
  assert.equal(forecastGoalValue(forecast, quota.resetDeadlines[0].expiresAt).percent, 164.5);
  assert.equal(forecastGoalValue(forecast, "2026-11-06T23:33:02Z").kind, "outside");
});
