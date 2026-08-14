import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boundedRatio, chartDrilldownBuckets, nextChartGranularity, percentageOf, stackedChartSegments } from "../public/visualization.js";

const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");

test("visualization ratios are proportional and safely bounded", () => {
  assert.equal(boundedRatio(25, 100), 0.25);
  assert.equal(percentageOf(25, 100), 25);
  assert.equal(percentageOf(150, 100), 100);
  assert.equal(percentageOf(-10, 100), 0);
  assert.equal(percentageOf(10, 0), 0);
  assert.equal(percentageOf(Number.NaN, 100), 0);
});

test("stacked chart segments retain their relative heights", () => {
  assert.deepEqual(
    stackedChartSegments([
      { key: "fresh", value: 20 },
      { key: "cached", value: 50 },
      { key: "output", value: 10 },
    ], 100, 200),
    [
      { key: "fresh", y: 160, height: 40 },
      { key: "cached", y: 60, height: 100 },
      { key: "output", y: 40, height: 20 },
    ],
  );
});

test("empty chart data produces zero-height segments", () => {
  assert.deepEqual(
    stackedChartSegments([{ key: "fresh", value: 12 }], 0, 205),
    [{ key: "fresh", y: 205, height: 0 }],
  );
});

test("chart drill-down moves from months to days and from days to hours", () => {
  assert.equal(nextChartGranularity("month"), "day");
  assert.equal(nextChartGranularity("day"), "hour");
  assert.equal(nextChartGranularity("hour"), null);
});

test("chart drill-down assigns calls to each calendar sub-unit", () => {
  const daily = chartDrilldownBuckets([
    { timestamp: "2026-02-01T12:00:00.000Z" },
    { timestamp: "2026-02-28T23:30:00.000Z" },
  ], { start: "2026-02-01T00:00:00.000Z", end: "2026-03-01T00:00:00.000Z" }, "day", "en-US");
  assert.equal(daily.length, 28);
  assert.equal(daily[0].calls.length, 1);
  assert.equal(daily.at(-1).calls.length, 1);

  const hourly = chartDrilldownBuckets([
    { timestamp: "2026-02-10T07:30:00.000Z" },
  ], { start: "2026-02-10T00:00:00.000Z", end: "2026-02-11T00:00:00.000Z" }, "hour", "en-US");
  assert.equal(hourly.length, 24);
  assert.equal(hourly[7].calls.length, 1);
});

test("chart columns reserve the same axis-label height when labels are hidden", () => {
  assert.match(styles, /\.chart-column label\s*\{[^}]*min-height:\s*13px;/);
  assert.match(styles, /\.chart-column label\s*\{[^}]*line-height:\s*13px;/);
});

test("overview cards stretch together while the chart itself remains fluid", () => {
  assert.match(styles, /\.analysis-grid\s*\{[^}]*align-items:\s*stretch;/);
  assert.match(styles, /\.analysis-grid \.cost-chart\s*\{[^}]*flex:\s*1 1 auto;[^}]*height:\s*auto;/);
});
