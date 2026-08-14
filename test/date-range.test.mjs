import assert from "node:assert/strict";
import test from "node:test";
import { defaultCustomRange, latestTimestamp, normalizeCustomRange, resolveDateRange, resolveWeeklyRange, timestampInRange, toDateTimeLocalValue } from "../public/date-range.js";

test("stores datetime-local values without converting their local wall time", () => {
  const date = new Date(2026, 7, 13, 14, 5);
  assert.equal(toDateTimeLocalValue(date), "2026-08-13T14:05");
  assert.deepEqual(defaultCustomRange(date), { start: "2026-08-13T00:00", end: null });
});

test("restores a valid custom range and falls back safely for corrupt storage", () => {
  const now = new Date(2026, 7, 13, 14, 5);
  assert.deepEqual(normalizeCustomRange({ start: "2026-08-01T08:30", end: "2026-08-02T17:45" }, now), { start: "2026-08-01T08:30", end: "2026-08-02T17:45" });
  assert.deepEqual(normalizeCustomRange({ start: "broken", end: "broken" }, now), { start: "2026-08-13T00:00", end: null });
});

test("a null custom end means now mode and adds no upper filter bound", () => {
  const range = resolveDateRange("custom", { start: "2026-08-01T00:00", end: null }, new Date(2026, 7, 13, 14, 5));
  assert.equal(range.end, null);
  assert.equal(timestampInRange("2026-08-20T00:00:00Z", range), true);
  assert.equal(timestampInRange("2026-07-30T23:59:59Z", range), false);
});

test("an explicit custom end is inclusive and latest calls sort by actual call time", () => {
  const range = resolveDateRange("custom", { start: "2026-08-01T00:00", end: "2026-08-02T12:00" });
  assert.equal(timestampInRange("2026-08-02T12:00:00", range), true);
  assert.equal(timestampInRange("2026-08-02T12:00:01", range), false);
  assert.equal(latestTimestamp([{ timestamp: "2026-08-01T12:00:00Z" }, { timestamp: "2026-08-02T09:00:00Z" }]), "2026-08-02T09:00:00Z");
});

test("weekly range starts 7 days before the current Codex reset", () => {
  const now = new Date("2026-08-14T15:00:00.000Z");
  const range = resolveWeeklyRange({ windowMinutes: 10080, resetsAt: "2026-08-20T12:00:00.000Z" }, now);
  assert.equal(range.start.toISOString(), "2026-08-13T12:00:00.000Z");
  assert.equal(range.end.toISOString(), now.toISOString());
  assert.equal(range.resetsAt.toISOString(), "2026-08-20T12:00:00.000Z");
});

test("a stale weekly reset rolls forward into the current 7-day cycle", () => {
  const now = new Date("2026-08-14T15:00:00.000Z");
  const range = resolveWeeklyRange({ windowMinutes: 10080, resetsAt: "2026-08-07T12:00:00.000Z" }, now);
  assert.equal(range.start.toISOString(), "2026-08-14T12:00:00.000Z");
  assert.equal(range.resetsAt.toISOString(), "2026-08-21T12:00:00.000Z");
  assert.equal(timestampInRange("2026-08-14T14:00:00.000Z", range), true);
  assert.equal(timestampInRange("2026-08-14T11:00:00.000Z", range), false);
});

test("without a reset date, weekly range is the last 7 days from now", () => {
  const now = new Date("2026-08-14T15:00:00.000Z");
  const range = resolveWeeklyRange(null, now);
  assert.equal(range.start.toISOString(), "2026-08-07T15:00:00.000Z");
  assert.equal(range.resetsAt, null);
});

test("a reset more than one week ahead is rewound to the current cycle", () => {
  const now = new Date("2026-08-14T15:00:00.000Z");
  const range = resolveWeeklyRange({ windowMinutes: 10080, resetsAt: "2026-09-03T12:00:00.000Z" }, now);
  assert.equal(range.start.toISOString(), "2026-08-13T12:00:00.000Z");
  assert.equal(range.resetsAt.toISOString(), "2026-08-20T12:00:00.000Z");
});
