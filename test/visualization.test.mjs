import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { boundedRatio, chartDrilldownBuckets, chartDrilldownFilterRange, nextChartGranularity, percentageOf, stackedChartSegments } from "../public/visualization.js";

const styles = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const app = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const markup = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");

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

test("chart drill-down exposes an inclusive transient filter without leaking into the next bucket", () => {
  const range = chartDrilldownFilterRange({
    start: "2026-02-01T00:00:00.000Z",
    end: "2026-03-01T00:00:00.000Z",
  });
  assert.equal(range.start.toISOString(), "2026-02-01T00:00:00.000Z");
  assert.equal(range.end.toISOString(), "2026-02-28T23:59:59.999Z");
  assert.equal(chartDrilldownFilterRange({ start: "broken", end: "broken" }), null);
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

test("hourly quota bars shrink to the available width without a horizontal scrollbar", () => {
  assert.match(styles, /body\[data-page="quota"\] \.cost-chart\.is-hourly\s*\{[^}]*overflow:\s*hidden;[^}]*gap:\s*clamp\(0px, \.12vw, 2px\);/);
  assert.match(styles, /body\[data-page="quota"\] \.cost-chart\.is-hourly \.chart-column\s*\{[^}]*flex:\s*1 1 0;[^}]*min-width:\s*0;/);
  assert.match(styles, /@media \(max-width:\s*720px\)[\s\S]*body\[data-page="quota"\] \.cost-chart\.is-hourly\s*\{[^}]*gap:\s*0;/);
  assert.match(app, /Math\.floor\(host\.clientWidth \/ 140\)/);
  assert.match(app, /window\.addEventListener\("resize",[\s\S]*renderCostChart\([\s\S]*"#quotaChart", "quota-hourly"\);/);
});

test("quota navigation arrows do not depend on mobile font glyph support", () => {
  assert.match(markup, /id="quotaPrevious"[^>]*>[\s\S]*quota-history-icon is-previous/);
  assert.match(markup, /id="quotaNext"[^>]*>[\s\S]*quota-history-icon is-next/);
  assert.match(styles, /\.quota-history-icon\s*\{[^}]*border-top:\s*2px solid currentColor;[^}]*border-right:\s*2px solid currentColor;/);
  assert.match(styles, /\.quota-history-button:disabled\s*\{[^}]*opacity:\s*\.58;/);
});

test("custom range keeps the Now control beside the End label", () => {
  assert.match(markup, /class="custom-range-field-heading"[\s\S]*for="customEnd"[^>]*data-i18n="period\.customEnd"[\s\S]*class="custom-now"[\s\S]*id="customEndNow"[^>]*aria-controls="customEnd"/);
  assert.match(styles, /\.custom-range-panel\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(styles, /\.custom-range-field-heading\s*\{[^}]*display:\s*flex;[^}]*justify-content:\s*space-between;/);
  assert.doesNotMatch(styles, /grid-template-columns:\s*1fr 1fr auto;/);
});

test("header quotas show exact reset dates, live countdowns, and clock-driven rollover", () => {
  assert.equal((markup.match(/data-weekly-header-countdown/g) || []).length, 1);
  assert.equal((markup.match(/data-five-hour-countdown/g) || []).length, 1);
  assert.equal((markup.match(/data-five-hour-mobile-remaining/g) || []).length, 1);
  assert.match(app, /toLocaleString\(locale\(\), \{ dateStyle: "medium", timeStyle: "short" \}\)/);
  assert.match(app, /function quotaPeriods\([^)]*\)[\s\S]*theoreticalWeeklyQuotaPeriod/);
  assert.match(app, /setInterval\(\(\) => \{\s*if \(!document\.hidden\) syncQuotaClock\(\);\s*\}, 1_000\);/);
  assert.match(styles, /\.header-quota\s*\{[^}]*font-variant-numeric:\s*tabular-nums;/s);
});

test("forecast chart hover exposes the date and interpolated series value", () => {
  assert.match(app, /class="quota-hover-target"[\s\S]*role="slider"/);
  assert.match(app, /target\.addEventListener\("pointermove", positionFromPointer\)/);
  assert.match(app, /forecastDateTimeLabel\(activeTime\)/);
  assert.match(app, /interpolateForecastPercent\(series, activeTime, \{ clamp: !forecast.partialHistory \}\)/);
  assert.match(app, /event\.key === "ArrowLeft"[\s\S]*event\.key === "ArrowRight"/);
  assert.match(styles, /\.quota-hover-tooltip rect\s*\{[^}]*fill:\s*var\(--surface\);/);
});
