import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { compactQuotaObservations, mergeWeeklyQuotaObservations } from "../src/quota-history.mjs";
import { analyzeCodexUsage } from "../src/analyzer.mjs";
import { toPublicUsage } from "../src/public-usage.mjs";
import { validateSyncPayload } from "../src/mesh-protocol.mjs";
import { buildQuotaForecast, interpolateForecastPercent } from "../public/quota-forecast.js";

const stamp = (hour) => new Date(Date.parse("2026-09-01T00:00:00Z") + hour * 3600000).toISOString();
const point = (hour, usedPercent) => ({ observedAt: stamp(hour), usedPercent });
const quota = (hour, percent) => ({ ...point(hour, percent), resetsAt: stamp(168), windowMinutes: 10080, planType: "pro" });
const observations = [point(1, 10), point(2, 10), point(3, 10), point(4, 30), point(5, 25), point(6, 25)];

test("compaction retains plateau boundaries, decreases and exact timestamps", () => {
  assert.deepEqual(compactQuotaObservations([...observations, point(3, 10), point(7, null)]), [observations[0], observations[2], ...observations.slice(3)]);
});

test("merging per-file quota summaries preserves measurements and clips early resets", () => {
  const left = mergeWeeklyQuotaObservations([quota(1, 10), quota(2, 10), quota(4, 30)]);
  const right = mergeWeeklyQuotaObservations([quota(3, 10), quota(5, 25), quota(6, 25)]);
  const merged = mergeWeeklyQuotaObservations([...left, ...right]);
  assert.deepEqual(merged[0].observations, compactQuotaObservations(observations));
  const reset = { ...quota(8, 1), resetsAt: stamp(175) };
  const clipped = mergeWeeklyQuotaObservations([...merged, reset]);
  assert.equal(clipped[1].endsAt, stamp(7));
  assert.ok(clipped[1].observations.every((p) => p.observedAt < stamp(7)));
  const adjusted = mergeWeeklyQuotaObservations(mergeWeeklyQuotaObservations([quota(1, 80), quota(2, 25)]));
  assert.equal(adjusted[0].peakUsedPercent, 80);
  assert.equal(adjusted[0].peakObservedAt, stamp(1));
});

test("measured past is independent of prices and preserves quota adjustments", () => {
  const options = { rangeStart: stamp(0), rangeEnd: stamp(168), observedAt: stamp(6), usedPercent: 25, observations, capacityCredits: 100 };
  const first = buildQuotaForecast({ ...options, samples: [{ timestamp: stamp(4), value: 1 }] });
  const changed = buildQuotaForecast({ ...options, samples: [{ timestamp: stamp(4), value: 999999 }] });
  assert.equal(first.historySource, "observed");
  assert.deepEqual(first.actual, changed.actual);
  assert.equal(first.actual[0].percent, 10);
  assert.equal(first.actual.at(-1).percent, 25);
  assert.equal(interpolateForecastPercent(first.actual, stamp(0), { clamp: false }), null);
  assert.equal(interpolateForecastPercent(first.actual, stamp(3.5)), 20);
});

test("measured history remains visible without priced samples or forecast calibration", () => {
  for (const project of [true, false]) {
    const result = buildQuotaForecast({ rangeStart: stamp(0), rangeEnd: stamp(168), observedAt: stamp(6), asOf: stamp(8), usedPercent: 25, observations, project });
    assert.equal(result.status, "ready");
    assert.equal(result.projectionUnavailable, project);
    assert.equal(result.actual.at(-1).timestamp, stamp(project ? 8 : 6));
    assert.equal(result.actual.at(-1).percent, 25);
    assert.equal(result.observedAt, stamp(6));
    assert.deepEqual(result.projected, []);
  }
});

test("current measured history stays flat until now and joins the forecast exactly", () => {
  const result = buildQuotaForecast({ rangeStart: stamp(0), rangeEnd: stamp(168), observedAt: stamp(6), asOf: stamp(12), usedPercent: 25,
    observations, capacityCredits: 100, samples: [{ timestamp: stamp(4), value: 1 }] });
  assert.equal(result.status, "ready");
  assert.equal(result.observedAt, stamp(6));
  assert.deepEqual(result.actual.at(-1), { timestamp: stamp(12), percent: 25 });
  assert.deepEqual(result.actual.at(-1), result.projected[0]);
  assert.equal(interpolateForecastPercent(result.actual, stamp(9), { clamp: false }), 25);
  const ended = buildQuotaForecast({ rangeStart: stamp(0), rangeEnd: stamp(7), observedAt: stamp(6), asOf: stamp(12), usedPercent: 25, observations });
  assert.equal(ended.actual.at(-1).timestamp, stamp(7));
  assert.equal(ended.actual.at(-1).percent, 25);
});

test("out-of-window observations cannot leak into another quota period", () => {
  const result = buildQuotaForecast({ rangeStart: stamp(0), rangeEnd: stamp(7), observedAt: stamp(6), usedPercent: 25,
    observations: [point(-1, 90), ...observations, point(8, 99), point(5.5, null)], project: false });
  assert.equal(result.actual.length, observations.length);
  assert.equal(result.actual[0].timestamp, stamp(1));
});

test("public quota observations expose only percentages and dates, with strict Mesh validation", () => {
  const published = toPublicUsage({ sessions: [], weeklyQuotaHistory: [{ ...quota(6, 25), observations: [{ ...point(6, 25), secret: "private" }] }] });
  assert.deepEqual(published.weeklyQuotaHistory[0].observations, [point(6, 25)]);
  const payload = { kind: "sync", snapshotVersion: 1, generatedAt: stamp(6), privacy: { projectMode: "hash", includeTitles: false }, upserts: [], removals: [], quotaHistory: published.weeklyQuotaHistory };
  assert.doesNotThrow(() => validateSyncPayload(payload));
  for (const invalid of [{ ...point(6, 25), secret: "private" }, point(6, null), point(6, 101), { observedAt: "invalid", usedPercent: 1 }]) {
    assert.throws(() => validateSyncPayload({ ...payload, quotaHistory: [{ ...quota(6, 25), observations: [invalid] }] }), /quota/);
  }
});

test("version 8 cached sessions are reparsed to recover historical quota observations", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "quota-history-migrate-"));
  try {
    await writeFile(path.join(dir, "rollout.jsonl"), [
      { type: "session_meta", timestamp: stamp(0), payload: { id: "quota-history" } },
      ...observations.map((p) => ({ type: "event_msg", timestamp: p.observedAt, payload: { type: "token_count", rate_limits: {
        secondary: { used_percent: p.usedPercent, window_minutes: 10080, resets_at: Date.parse(stamp(168)) / 1000 }, plan_type: "pro",
      } } })),
    ].map(JSON.stringify).join("\n"));
    const options = { sessionsPath: dir, archivedSessionsPath: path.join(dir, "missing"), sessionIndexPath: path.join(dir, "missing-index") };
    const legacy = await analyzeCodexUsage(options);
    legacy.analyzerVersion = 8;
    for (const period of legacy.sessions[0].weeklyQuotaHistory) delete period.observations;
    const recovered = await analyzeCodexUsage({ ...options, previousData: legacy });
    assert.equal(recovered.analyzerVersion, 9);
    assert.deepEqual(recovered.weeklyQuotaHistory[0].observations, compactQuotaObservations(observations));
  } finally { await rm(dir, { recursive: true, force: true }); }
});
