import assert from "node:assert/strict";
import test from "node:test";
import { weeklyQuotaPeriods, shortQuotaDisplay, quotaCountdownText, normalizeTimeFormat, timeFormatOptions } from "../public/quota-display.js";
import { createMiniData, selectMiniSource } from "../public/mini-data.js";
import { desktopAddress, miniPreferences, remoteApiUrl } from "../src/desktop-options.mjs";

test("remote URLs opt out of local startup, respect paths, and reject embedded credentials", () => {
  const address = desktopAddress({ PORT: "invalid" }, ["--url", "https://example.test/codex/"]);
  assert.equal(address.external, true);
  assert.equal(address.baseUrl, "https://example.test/codex/");
  assert.equal(remoteApiUrl(address.baseUrl, "usage?source=centralized"), "https://example.test/codex/api/usage?source=centralized");
  assert.equal(desktopAddress({ DASHBOARD_URL: "http://localhost:9000" }).baseUrl, "http://localhost:9000/");
  assert.equal(desktopAddress({}, ["--url=https://example.test/index.html"]).baseUrl, "https://example.test/");
  for (const url of ["file:///etc/passwd", "https://user:pass@example.test", "https://example.test/?token=secret", "https://example.test/#token"]) {
    assert.throws(() => desktopAddress({ DASHBOARD_URL: url }));
  }
  assert.throws(() => desktopAddress({}, ["--url="]));
  assert.throws(() => desktopAddress({}, ["--url"]));
  for (const endpoint of ["https://other.test", "../admin", "usage?source=local&force=1", "cookies", "usage?source=wrong"]) assert.throws(() => remoteApiUrl(address.baseUrl, endpoint));
});

test("desktop preserves custom bind address and port, with connectable wildcard URLs", () => {
  assert.deepEqual(desktopAddress({ HOST: "0.0.0.0", PORT: "4328" }), { host: "0.0.0.0", port: 4328, url: "http://127.0.0.1:4328" });
  assert.equal(desktopAddress({ HOST: "::", PORT: "4329" }).url, "http://[::1]:4329");
  assert.equal(desktopAddress({ HOST: "localhost", PORT: "5000" }).url, "http://localhost:5000");
  for (const port of ["0", "65536", "oops", "4.5"]) assert.throws(() => desktopAddress({ PORT: port }));
});

test("native preferences retain a visible quota and allow only known source and theme values", () => {
  assert.deepEqual(miniPreferences({ fiveHour: "0", weekly: "0", source: "centralized", theme: "blue", language: "fr", timeFormat: "24" }),
    { fiveHour: "1", weekly: "0", source: "centralized", theme: "blue", language: "fr", timeFormat: "24" });
  assert.deepEqual(miniPreferences({ source: "https://elsewhere", theme: "invalid", language: "../../" }), { fiveHour: "1", weekly: "1" });
});

test("time format accepts system, 12-hour and 24-hour preferences", () => {
  assert.equal(normalizeTimeFormat("12"), "12");
  assert.equal(normalizeTimeFormat("24"), "24");
  assert.equal(normalizeTimeFormat("invalid"), "system");
  assert.equal(typeof timeFormatOptions("system").hour12, "boolean");
  assert.deepEqual(timeFormatOptions("12"), { hour12: true });
  assert.deepEqual(timeFormatOptions("24"), { hour12: false });
  const date = new Date("2026-09-08T13:05:00Z");
  assert.match(date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", ...timeFormatOptions("12") }), /01:05 PM/);
  assert.match(date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", ...timeFormatOptions("24") }), /13:05/);
});

test("hosted mini uses centralized capabilities and local mini respects explicit source", () => {
  assert.equal(selectMiniSource({ apiVersion: 1, sources: ["centralized"], defaultSource: "centralized" }, "local"), "centralized");
  assert.equal(selectMiniSource({ apiVersion: 1, sources: ["local", "centralized"], defaultSource: "local" }, "centralized"), "centralized");
  assert.throws(() => selectMiniSource({ apiVersion: 1, sources: [] }, "local"));
});

test("mini and dashboard share weekly rollover, unknown short reset, and countdown boundaries", () => {
  const reset = "2026-09-07T12:00:00Z";
  const quota = { remainingPercent: 28, resetsAt: reset, observedAt: "2026-09-07T10:00:00Z" };
  const data = { weeklyQuotaHistory: [quota], fiveHourQuota: quota };
  const before = new Date(Date.parse(reset) - 1);
  assert.equal(weeklyQuotaPeriods(data, before)[0], quota);
  assert.equal(shortQuotaDisplay(quota, before).remainingPercent, 28);
  assert.match(quotaCountdownText(reset, "en-GB", before), /1s/);
  assert.equal(weeklyQuotaPeriods(data, new Date(reset))[0].theoretical, true);
  assert.equal(weeklyQuotaPeriods(data, new Date(reset))[0].remainingPercent, null);
  assert.equal(shortQuotaDisplay(quota, new Date(reset)).remainingPercent, null);
  assert.equal(shortQuotaDisplay({ remainingPercent: 12, resetsAt: null }).remainingPercent, 12);
  assert.equal(shortQuotaDisplay(null).resetsAt, null);
  assert.equal(quotaCountdownText(null, "en-GB"), "");
});

test("connection loss preserves the snapshot timestamp, recovery replaces it", async () => {
  let fail = false;
  let time = 100;
  const model = createMiniData({ now: () => time, onChange() {}, fetchJson: async () => {
    if (fail) throw new Error("offline");
    return { weeklyQuota: { remainingPercent: time } };
  } });
  model.setSource("local");
  await model.load();
  fail = true; time = 200;
  await model.load();
  assert.equal(model.snapshot.error, true);
  assert.equal(model.snapshot.receivedAt, 100);
  assert.equal(model.snapshot.data.weeklyQuota.remainingPercent, 100);
  fail = false;
  await model.load();
  assert.equal(model.snapshot.error, false);
  assert.equal(model.snapshot.receivedAt, 200);
});

test("requests never overlap and a previous source cannot populate the new source", async () => {
  let release;
  const urls = [];
  const model = createMiniData({ onChange() {}, fetchJson: (url) => { urls.push(url); return new Promise((resolve) => { release = resolve; }); } });
  model.setSource("local");
  const first = model.load();
  const duplicate = model.load();
  assert.equal(urls.length, 1);
  model.setSource("centralized");
  release({ weeklyQuota: { remainingPercent: 99 } });
  await Promise.all([first, duplicate]);
  assert.equal(model.snapshot.data, null);
  const next = model.load();
  assert.match(urls[1], /source=centralized$/);
  release({ weeklyQuota: { remainingPercent: 20 } });
  await next;
  assert.equal(model.snapshot.data.weeklyQuota.remainingPercent, 20);
});
