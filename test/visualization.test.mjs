import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boundedRatio, percentageOf, stackedChartSegments } from "../public/visualization.js";

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

test("chart columns reserve the same axis-label height when labels are hidden", () => {
  assert.match(styles, /\.chart-column label\s*\{[^}]*min-height:\s*13px;/);
  assert.match(styles, /\.chart-column label\s*\{[^}]*line-height:\s*13px;/);
});
