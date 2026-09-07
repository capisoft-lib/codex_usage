import { shortQuotaDisplay, quotaCountdownText } from "../public/quota-display.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { quotaCountdownParts } from "../public/date-range.js";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const renderSource = source.slice(source.indexOf("function formatQuotaCountdown("), source.indexOf("function renderQuotaPage("));
const clockStart = source.indexOf("function syncQuotaClock(");
const clockSource = source.slice(clockStart, source.indexOf("\nsetInterval(", clockStart));
const resetTime = Date.parse("2026-08-31T12:00:00.000Z");

function navigation(quota) {
  let now = resetTime - 1;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const elements = new Map();
  const weeklyQuota = { remainingPercent: 80, resetsAt: "2026-09-05T12:00:00.000Z" };
  const state = { data: { fiveHourQuota: quota }, view: "overview", renderedQuotaReset: weeklyQuota.resetsAt };
  const messages = {
    "quota.fiveHour": "5 hours", "nav.quota": "Weekly quota", "quota.reset": "Reset",
    "quota.awaitingShort": "Awaiting data", "quota.awaitingObservation": "Waiting for the first Codex observation",
  };
  const context = vm.createContext({
    Date: ClockDate, Intl, Number, state, quotaCountdownParts,
    shortQuotaDisplay: (quota) => shortQuotaDisplay(quota, now),
    quotaCountdownText,
    clockOptions: (options) => options,
    locale: () => "en-GB", quotaPeriods: () => [weeklyQuota], currentQuotaResetAt: () => new ClockDate(weeklyQuota.resetsAt),
    t: (key, values) => key === "kpi.remaining" ? `${values.n}% remaining` : messages[key] || key,
    $$: (selector) => {
      if (!elements.has(selector)) elements.set(selector, { textContent: "", attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
      return [elements.get(selector)];
    },
  });
  vm.runInContext(renderSource + "\n" + clockSource, context);
  return {
    state,
    tick(time) { now = time; vm.runInContext("syncQuotaClock()", context); },
    text(selector) { return elements.get(selector)?.textContent; },
    element(selector) { return elements.get(selector); },
  };
}

test("the quota clock clears expired five-hour data and restores it after a new observation", () => {
  const nav = navigation({ usedPercent: 100, remainingPercent: 0, resetsAt: new Date(resetTime).toISOString() });
  nav.tick(resetTime - 1);
  assert.equal(nav.text("[data-five-hour-remaining]"), "0% remaining");
  assert.match(nav.text("[data-five-hour-countdown]"), /1s/);
  assert.notEqual(nav.text("[data-five-hour-reset]"), "—");

  for (const time of [resetTime, resetTime + 1, resetTime + 24 * 60 * 60 * 1000]) {
    nav.tick(time);
    assert.equal(nav.text("[data-five-hour-remaining]"), "—");
    assert.equal(nav.text("[data-five-hour-mobile-remaining]"), "—");
    assert.equal(nav.text("[data-five-hour-reset]"), "—");
    assert.equal(nav.text("[data-five-hour-countdown]"), "Awaiting data");
    assert.match(nav.element('[data-header-quota="five-hour"]').attributes["aria-label"], /Waiting for the first Codex observation/);
    assert.match(nav.element('[data-nav-section="quota"]').attributes["aria-label"], /5 hours, Waiting for the first Codex observation/);
    assert.equal(nav.text("[data-weekly-header-remaining]"), "80% remaining");
  }

  nav.state.data.fiveHourQuota = { remainingPercent: 90, resetsAt: new Date(resetTime + 29 * 60 * 60 * 1000).toISOString() };
  nav.tick(resetTime + 24 * 60 * 60 * 1000);
  assert.equal(nav.text("[data-five-hour-remaining]"), "90% remaining");
  assert.equal(nav.text("[data-five-hour-mobile-remaining]"), "90% remaining");
  assert.match(nav.text("[data-five-hour-countdown]"), /5h/);
  assert.doesNotMatch(nav.element('[data-header-quota="five-hour"]').attributes["aria-label"], /Waiting/);
});

test("missing or invalid five-hour reset dates never invent a countdown or reset balance", () => {
  for (const quota of [null, { remainingPercent: 12, resetsAt: null }, { remainingPercent: 12, resetsAt: "invalid" }]) {
    const nav = navigation(quota);
    nav.tick(resetTime);
    assert.equal(nav.text("[data-five-hour-remaining]"), quota ? "12% remaining" : "—");
    assert.equal(nav.text("[data-five-hour-reset]"), "—");
    assert.equal(nav.text("[data-five-hour-countdown]"), "—");
  }
});
