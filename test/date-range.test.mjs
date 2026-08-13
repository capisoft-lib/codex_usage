import assert from "node:assert/strict";
import test from "node:test";
import { defaultCustomRange, latestTimestamp, normalizeCustomRange, resolveDateRange, timestampInRange, toDateTimeLocalValue } from "../public/date-range.js";

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
