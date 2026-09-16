import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { weeklyQuotaPeriods } from "../public/quota-display.js";
import { sameQuotaReset } from "../public/quota-periods.js";
import { fetchUsage } from '../public/storage-fetch.js';

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const constants = source.slice(source.indexOf("const POLL_INTERVAL_MS"), source.indexOf("const CUSTOM_RANGE_KEY"));
const loading = source.slice(source.indexOf("function applyUsageData("), source.indexOf("function pageQuery("));
const polling = source.slice(source.indexOf("\nsetInterval(", source.indexOf("function syncQuotaClock(")));

function dashboard({ mode = "centralized", view = "overview", data = { generatedAt: "initial" }, fetch: fetchImpl } = {}) {
  let now = 1_000_000;
  class ClockDate extends Date {
    static now() { return now; }
  }
  const requests = [];
  const renders = [];
  const loadingStates = [];
  const timers = [];
  const listeners = new Map();
  const state = { data, dataMode: mode, view };
  const document = { hidden: false, addEventListener: (event, callback) => listeners.set(event, callback) };
  const context = vm.createContext({
    state, document, Date: ClockDate, URL, hydratePage: (data) => data, clearTimeout() {}, pageQuery: () => ({view:state.view, period:state.period}), pageRequestKey: () => `${state.dataMode}:${state.view}:${state.period}`, URLSearchParams, AbortController, weeklyQuotaPeriods, sameQuotaReset,
    fetch: async (url, options) => {
      const normalized = new URL(url, "http://localhost"); normalized.searchParams.delete("query"); requests.push(normalized.pathname + normalized.search);
      return fetchImpl ? fetchImpl(url, requests.length, options) : { ok: true, json: async () => ({ generatedAt: String(now) }) };
    },
    setInterval: (callback, interval) => timers.push({ callback, interval, next: now + interval }),
    $: () => ({ classList: { add() {}, remove() {} }, textContent: "" }),
    loadUsageCache: () => null, saveUsageCache() {},
    populateNodes() {}, populateModels() {}, populateFolders() {}, syncQuotaClock() {}, setPageLoading: (active, error) => loadingStates.push({active,error}),
    renderQuotaNav() {}, renderFreshness() {}, escapeHtml: String,
    render: () => renders.push(state.data.generatedAt), toast() {}, t: (key) => key,
  });
  context.fetchDashboardUsage = (url, options) => fetchUsage(url, options, {fetchImpl:context.fetch,delayMs:0});
  vm.runInContext(`${constants}\n${loading}\n${polling}`, context);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    state, requests, renders, loadingStates,
    load: (force = false, silent = false) => vm.runInContext(`loadData(${force},${silent})`, context),
    poll: () => vm.runInContext("pollForNewData()", context),
    async advance(ms) {
      const end = now + ms;
      while (Math.min(...timers.map((timer) => timer.next)) <= end) {
        now = Math.min(...timers.map((timer) => timer.next));
        for (const timer of timers) {
          if (timer.next !== now) continue;
          timer.next += timer.interval;
          timer.callback();
        }
        await flush();
      }
      now = end;
    },
    async visible(visible) {
      document.hidden = !visible;
      listeners.get("visibilitychange")();
      await flush();
    },
  };
}

test("centralized polling keeps rendering new snapshots beyond the former throttle window", async () => {
  const ui = dashboard();
  // Direct calls reproduce the old synchronous early-return lock independently of the timer interval.
  for (let index = 0; index < 3; index += 1) {
    await ui.poll();
    await ui.advance(1);
  }
  assert.equal(ui.requests.length, 3);
  assert.equal(ui.renders.length, 3);
  await ui.advance(65_000);
  assert.equal(ui.requests.length, 7);
  assert.equal(ui.renders.length, 7);
});

test("quota paints metadata first, reuses unchanged graphs and never requests full usage", async () => {
  const reset = "2099-09-21T00:00:00Z";
  const metadata = { revision: "v1", generatedAt: "first", quotaOnly: true, weeklyQuota: { resetsAt: reset }, sessions: [] };
  let finish;
  const detail = new Promise((resolve) => { finish = resolve; });
  const ui = dashboard({ view: "quota", data: null, fetch: async (url, count, options) => {
    if (url.includes("detail=1")) return detail;
    if (options.headers["If-None-Match"]) return { status: 304, headers: new Headers({ etag: '"v1"' }) };
    return { ok: true, headers: new Headers({ etag: '"v1"' }), json: async () => metadata };
  } });
  const loading = ui.load();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.renders.length, 1);
  assert.equal(ui.state.data.quotaDetail, undefined);
  finish({ ok: true, headers: new Headers({ etag: '"v1"' }), json: async () => ({ ...metadata, quotaDetail: { reset, forecast: {} } }) });
  await loading;
  await ui.poll();
  assert.equal(ui.renders.length, 2);
  assert.equal(ui.requests.filter((url) => url.includes("detail=1")).length, 1);
  assert.ok(ui.requests.every((url) => url.startsWith("/api/quota?")));
});

test("a late full response cannot replace quota data after navigation", async () => {
  let finish;
  const full = new Promise((resolve) => { finish = resolve; });
  const metadata = { revision: "v1", generatedAt: "quota", quotaOnly: true, sessions: [] };
  const ui = dashboard({ fetch: async (url) => url.startsWith("/api/page") ? full : { ok: true, headers: new Headers(), json: async () => url.includes("detail=1") ? { ...metadata, quotaDetail: { reset: null } } : metadata } });
  const first = ui.load();
  ui.state.view = "quota";
  await ui.load();
  finish({ ok: true, json: async () => ({ generatedAt: "late-full" }) });
  await first;
  assert.equal(ui.state.data.generatedAt, "quota");
  assert.ok(!ui.renders.includes("late-full"));
});

test("refresh preserves the displayed graph through reset jitter, slow responses and failure", async () => {
  const reset = "2099-09-21T09:57:16Z", corrected = "2099-09-21T09:59:23Z";
  let revision = "v1", fail = false, finish;
  const metadata = () => ({ revision, generatedAt: revision, quotaOnly: true, weeklyQuota: { resetsAt: revision === "v1" ? reset : corrected }, sessions: [] });
  const ui = dashboard({ view: "quota", data: null, fetch: async (url) => {
    if (url.includes("detail=1") && revision === "v2") return new Promise((resolve, reject) => { finish = () => fail ? reject(new Error("offline")) : resolve({ ok: true, headers: new Headers(), json: async () => ({ ...metadata(), quotaDetail: { reset: corrected, forecast: { actual: [2] } } }) }); });
    return { ok: true, headers: new Headers(), json: async () => url.includes("detail=1") ? { ...metadata(), quotaDetail: { reset, forecast: { actual: [1] } } } : metadata() };
  } });
  await ui.load();
  const previous = ui.state.data;
  const renderCount = ui.renders.length;
  revision = "v2";
  fail = true;
  const first = ui.poll();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ui.state.data, previous);
  assert.equal(ui.renders.length, renderCount);
  // Re-rendering the old graph can restore its old timestamp while in flight.
  ui.state.selectedQuotaReset = reset;
  const shared = ui.load();
  const requestCount = ui.requests.length;
  finish();
  await Promise.all([first, shared]);
  assert.equal(ui.requests.length, requestCount);
  assert.equal(ui.state.data, previous);
  fail = false;
  const next = ui.poll();
  await new Promise((resolve) => setImmediate(resolve));
  finish();
  await next;
  assert.equal(ui.state.data.quotaDetail.reset, corrected);
  assert.equal(ui.renders.length, renderCount + 1);
});

test("visible dashboards check for new data every fifteen seconds in both modes", async () => {
  for (const mode of ["local", "centralized"]) {
    const ui = dashboard({ mode });
    await ui.advance(14_999);
    assert.equal(ui.requests.length, 0);
    await ui.advance(1);
    assert.equal(ui.renders.length, 1, mode);
    await ui.advance(30_000);
    assert.equal(ui.renders.length, 3, mode);
    assert.equal(ui.requests.filter((url) => url.startsWith("/api/page?")).length, 3);
  }
});

test("a failed initial load retries automatically without an existing snapshot", async () => {
  for (const mode of ["local", "centralized"]) {
    const ui = dashboard({ mode, data: null, fetch: async (url, count) => {
      if (count === 1) throw new Error("offline");
      return { ok: true, json: async () => ({ generatedAt: "recovered" }) };
    } });
    await ui.load();
    assert.equal(ui.state.data, null);
    await ui.advance(15_000);
    assert.equal(ui.state.data?.generatedAt, "recovered", mode);
    assert.deepEqual(ui.renders, ["recovered"]);
  }
});

test("hidden tabs pause polling and immediately refresh when visible again", async () => {
  const ui = dashboard();
  await ui.advance(15_000);
  await ui.visible(false);
  await ui.advance(60_000);
  assert.equal(ui.requests.length, 1);
  await ui.visible(true);
  assert.equal(ui.requests.length, 2);
  // A second return within the old centralized throttle must not latch the request lock.
  await ui.visible(false);
  await ui.visible(true);
  await ui.advance(15_000);
  assert.equal(ui.requests.length, 4);
});

test("local polling downloads usage only after the snapshot changes", async () => {
  let generatedAt = "initial";
  const ui = dashboard({ mode: "local", fetch: async () => ({ ok: true, json: async () => ({ generatedAt }) }) });
  await ui.poll();
  await ui.poll();
  assert.deepEqual(ui.requests, ["/api/health", "/api/health"]);
  assert.deepEqual(ui.renders, []);
  generatedAt = "updated";
  await ui.poll();
  assert.deepEqual(ui.requests.slice(2), ["/api/health", "/api/page?source=local"]);
  assert.deepEqual(ui.renders, ["updated"]);
  await ui.poll();
  assert.equal(ui.requests.length, 5);
  assert.equal(ui.renders.length, 1);
});

test("slow requests are shared by automatic and manual loads", async () => {
  let respond;
  const pending = new Promise((resolve) => { respond = resolve; });
  const ui = dashboard({ fetch: () => pending });
  const first = ui.poll();
  await ui.advance(45_000);
  const manual = ui.load(true);
  assert.equal(ui.requests.length, 1);
  respond({ ok: true, json: async () => ({ generatedAt: "updated" }) });
  await Promise.all([first, manual]);
  assert.deepEqual(ui.renders, ["updated"]);
  await ui.load(true);
  assert.equal(ui.requests.at(-1), "/api/page?source=centralized&refresh=1");
  await ui.advance(15_000);
  assert.equal(ui.requests.length, 3);
});

test("HTTP, network and invalid JSON failures retain the snapshot and release the poll lock", async () => {
  for (const mode of ["local", "centralized"]) {
    for (const failure of [
      async () => ({ ok: false, status: 503, json: async () => ({ error: "Unavailable" }) }),
      async () => { throw new Error("offline"); },
      async () => ({ ok: true, json: async () => { throw new Error("Invalid JSON"); } }),
    ]) {
      const ui = dashboard({ mode, fetch: async (url, count) => count === 1
        ? failure() : { ok: true, json: async () => ({ generatedAt: "recovered" }) } });
      await ui.poll();
      assert.equal(ui.state.data.generatedAt, "initial");
      assert.equal(ui.renders.length, 0);
      await ui.advance(15_000);
      assert.equal(ui.state.data.generatedAt, "recovered", mode);
    }
  }
});

test("Today to All failure hides stale values, then a retry displays all history", async () => {
  let fail = true;
  const ui = dashboard({fetch: async (url) => {
    const {period} = JSON.parse(new URL(url, 'http://localhost').searchParams.get('query'));
    if (period === 'all' && fail) return Response.json({error:'Unavailable'}, {status:500});
    return Response.json({generatedAt:period, pageOnly:true, pageData:{view:'overview', totals:{count:period === 'all' ? 100 : 3}}});
  }});
  ui.state.period = 'today';
  await ui.load();
  ui.state.period = 'all';
  await ui.load(false, true);
  assert.equal(ui.state.data.pageData.totals.count, 3);
  assert.equal(ui.loadingStates.at(-1).active, true, 'Old period must remain hidden after failure');
  assert.ok(ui.loadingStates.at(-1).error, 'A filter failure must be visible even on a silent load');
  fail = false;
  await ui.load();
  assert.equal(ui.state.data.pageData.totals.count, 100);
  assert.equal(ui.loadingStates.at(-1).active, false);
});

test("an uncached response drops the previous ETag after concurrent ingestion", async () => {
  const headers = [];
  const ui = dashboard({fetch:async (url, count, options) => {
    headers.push(options.headers['If-None-Match']);
    return Response.json({generatedAt:String(count),pageOnly:true}, {headers: count === 1 ? {ETag:'"old"'} : {'Cache-Control':'private, no-store'}});
  }});
  await ui.load(); await ui.load(); await ui.load();
  assert.deepEqual(headers, [undefined, '"old"', undefined]);
});
