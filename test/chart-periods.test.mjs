import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { resolveDateRange, timestampInRange } from "../public/date-range.js";
import * as visualization from "../public/visualization.js";

const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const bucketSource = app.slice(app.indexOf("function bucketsFor("), app.indexOf("function hourlyBucketsFor("));
const renderSource = app.slice(app.indexOf("function renderCostChart("), app.indexOf("function renderTable("));
const visualizationBindings = Object.fromEntries(app.match(/import \{ ([^}]+) \} from "\.\/visualization\.js";/)[1]
  .split(", ").map((name) => [name, visualization[name]]));

function runtimeBuckets(now) {
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now.getTime()])); }
  }
  return vm.runInNewContext(`(${bucketSource})`, {
    ...visualizationBindings,
    Date: FixedDate,
    locale: () => "en-US",
    resolveDateRange,
  });
}

const callAt = (id, date) => ({ id, timestamp: date.toISOString() });
const ids = (buckets) => Array.from(buckets).flatMap((bucket) => Array.from(bucket.calls, (call) => call.id)).sort();

test("runtime 12-month chart covers the full rolling range, including both partial months", () => {
  const now = new Date(2026, 7, 27, 14, 5);
  const range = resolveDateRange("12m", null, now);
  const calls = [
    callAt("before", new Date(range.start.getTime() - 1)),
    callAt("start", range.start),
    callAt("last-year", new Date(2025, 10, 15, 12)),
    callAt("month-start", new Date(2026, 7, 1)),
    callAt("now", now),
    callAt("future", new Date(now.getTime() + 1)),
    { id: "invalid", timestamp: "invalid" },
  ];
  const buckets = runtimeBuckets(now)(calls, "12m");
  assert.equal(buckets.length, 13);
  assert.ok(buckets.every((bucket) => bucket.granularity === "month"));
  assert.equal(buckets[0].start.getTime(), range.start.getTime());
  assert.equal(buckets.at(-1).end.getTime(), now.getTime() + 1);
  assert.deepEqual(ids(buckets), ["last-year", "month-start", "now", "start"]);
  assert.equal(new Set(Array.from(buckets, (bucket) => bucket.label)).size, buckets.length);
});

test("runtime all-history chart retains older years and empty months without a twelve-month cap", () => {
  const now = new Date(2026, 7, 31, 12);
  const calls = [
    callAt("recent", new Date(2026, 7, 30, 12)),
    callAt("oldest", new Date(2024, 0, 15, 12)),
    callAt("next-year", new Date(2025, 0, 15, 12)),
    callAt("now", now),
    callAt("future", new Date(2026, 8, 1)),
    { id: "invalid", timestamp: "invalid" },
  ];
  const snapshot = structuredClone(calls);
  const buckets = runtimeBuckets(now)(calls, "all");
  assert.equal(buckets.length, 32);
  assert.equal(buckets[0].start.getTime(), new Date(2024, 0, 1).getTime());
  assert.equal(buckets[1].calls.length, 0);
  assert.deepEqual(ids(buckets), ["next-year", "now", "oldest", "recent"]);
  assert.notEqual(buckets[0].label, buckets[12].label);
  assert.deepEqual(calls, snapshot);
});

test("monthly drill-down preserves the inclusive filter limits without leaking older or future calls", () => {
  const now = new Date(2026, 7, 27, 14, 5);
  const range = resolveDateRange("12m", null, now);
  const calls = [
    callAt("before", new Date(range.start.getTime() - 1)),
    callAt("start", range.start),
    callAt("september", new Date(2025, 8, 1)),
    callAt("now", now),
    callAt("future", new Date(now.getTime() + 1)),
  ];
  const buckets = runtimeBuckets(now)(calls, "12m");
  for (const bucket of [buckets[0], buckets.at(-1)]) {
    assert.equal(visualization.nextChartGranularity(bucket.granularity), "day");
    const filter = visualization.chartDrilldownFilterRange(bucket);
    const filtered = calls.filter((call) => timestampInRange(call.timestamp, filter));
    const daily = visualization.chartDrilldownBuckets(filtered, bucket, "day");
    assert.deepEqual(ids(daily), ids([bucket]));
    assert.equal(daily[0].start.getTime(), bucket.start.getTime());
    assert.equal(daily.at(-1).end.getTime(), bucket.end.getTime());
  }
});

test("empty all-history chart starts in the current month, not at the Unix epoch", () => {
  const now = new Date(2026, 7, 31, 12);
  const bucketsFor = runtimeBuckets(now);
  for (const calls of [[], [{ timestamp: "invalid" }], [callAt("future", new Date(2027, 0, 1))]]) {
    const buckets = bucketsFor(calls, "all");
    assert.equal(buckets.length, 1);
    assert.equal(buckets[0].start.getTime(), new Date(2026, 7, 1).getTime());
    assert.deepEqual(ids(buckets), []);
  }
  assert.equal(bucketsFor([], "12m").length, 13);
});

test("monthly chart boundaries follow local calendar months across leap years and clock changes", () => {
  const now = new Date(2024, 1, 29, 12);
  const buckets = runtimeBuckets(now)([], "12m");
  assert.equal(buckets.length, 13);
  assert.equal(buckets[0].start.getTime(), new Date(2023, 1, 28).getTime());
  for (let index = 0; index < buckets.length - 1; index++) {
    const end = buckets[index].end;
    assert.equal(end.getTime(), buckets[index + 1].start.getTime());
    assert.equal(end.getDate(), 1);
    assert.equal(end.getHours(), 0);
    assert.equal(end.getMinutes(), 0);
  }
});

test("short runtime chart periods keep their existing hourly and daily grouping", () => {
  const bucketsFor = runtimeBuckets(new Date(2026, 7, 31, 12));
  for (const [period, count, granularity] of [["today", 24, "hour"], ["7d", 7, "day"], ["30d", 30, "day"]]) {
    const buckets = bucketsFor([], period);
    assert.equal(buckets.length, count);
    assert.ok(buckets.every((bucket) => bucket.granularity === granularity));
  }
});

test("runtime renders every historical month and preserves the selected period through zoom and back", () => {
  const now = new Date(2026, 7, 31, 12);
  const calls = [callAt("old", new Date(2024, 0, 15, 12)), callAt("recent", new Date(2026, 7, 30, 12))];
  for (const width of [360, 1280]) {
    const state = { period: "all", chartZoom: {}, chartZoomBasePeriods: {}, transientRange: null };
    const classes = new Map();
    let columns = [];
    let back;
    const host = {
      clientWidth: width,
      innerHTML: "",
      classList: { toggle: (name, enabled) => classes.set(name, enabled) },
      querySelectorAll: () => {
        columns = [...host.innerHTML.matchAll(/data-bucket-index="(\d+)"/g)].map((match) => ({
          dataset: { bucketIndex: match[1] },
          listeners: {},
          addEventListener(name, listener) { this.listeners[name] = listener; },
        }));
        return columns;
      },
      querySelector: () => host.innerHTML.includes("chart-zoom-back")
        ? { addEventListener: (_name, listener) => { back = listener; } }
        : null,
    };
    const renderCostChart = vm.runInNewContext(`${renderSource}; renderCostChart`, {
      ...visualizationBindings,
      state,
      $: () => host,
      bucketsFor: runtimeBuckets(now),
      locale: () => "en-US",
      costOfCalls: (items) => ({ cost: items.length, freshInputCost: 0, cachedInputCost: 0, cacheWriteCost: items.length, outputCost: 0 }),
      formatCost: String,
      formatApiSummary: (summary) => String(summary.cost),
      escapeHtml: String,
      t: (key, params) => `${key} ${params?.label ?? ""}`,
      render: () => renderCostChart(calls.filter((call) => timestampInRange(call.timestamp, state.transientRange || resolveDateRange(state.period, null, now)))),
    });
    renderCostChart(calls);
    assert.equal(columns.length, 32);
    assert.match(host.innerHTML, /chart-segment writes/);
    assert.equal(classes.get("is-monthly"), true);
    assert.equal((host.innerHTML.match(/<rect /g) || []).length, 2);
    const labels = [...host.innerHTML.matchAll(/<label>([^<]+)<\/label>/g)];
    assert.equal(labels.length, Math.min(8, Math.floor(width / 80)));
    assert.equal(labels[0][1], "Jan 24");
    assert.equal(labels.at(-1)[1], "Aug 26");

    columns[0].listeners.click();
    assert.equal(state.period, "custom");
    assert.equal(state.transientRange.start.getTime(), new Date(2024, 0, 1).getTime());
    assert.equal(columns.length, 31);
    assert.equal(classes.get("is-monthly"), false);
    assert.equal((host.innerHTML.match(/<rect /g) || []).length, 1);
    back();
    assert.equal(state.period, "all");
    assert.equal(state.transientRange, null);
    assert.equal(columns.length, 32);
  }
});

test("long monthly charts can shrink all their columns into the available width", () => {
  const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
  assert.match(styles, /\.cost-chart\.is-monthly\s*\{[^}]*gap:\s*0;/);
  assert.match(styles, /\.cost-chart\.is-monthly \.chart-column\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/);
});
