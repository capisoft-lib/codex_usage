import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/app.js", import.meta.url), "utf8");
const constants = source.slice(source.indexOf("const POLL_INTERVAL_MS"), source.indexOf("const CUSTOM_RANGE_KEY"));
const loading = source.slice(source.indexOf("function applyUsageData("), source.indexOf("function escapeHtml("));
const polling = source.slice(source.indexOf("\nsetInterval(", source.indexOf("function syncQuotaClock(")));

function dashboard({ mode = "centralized", data = { generatedAt: "initial" }, fetch: fetchImpl } = {}) {
  let now = 1_000_000;
  class ClockDate extends Date {
    static now() { return now; }
  }
  const requests = [];
  const renders = [];
  const timers = [];
  const listeners = new Map();
  const state = { data, dataMode: mode };
  const document = { hidden: false, addEventListener: (event, callback) => listeners.set(event, callback) };
  const context = vm.createContext({
    state, document, Date: ClockDate, URLSearchParams,
    fetch: async (url) => {
      requests.push(url);
      return fetchImpl ? fetchImpl(url, requests.length) : { ok: true, json: async () => ({ generatedAt: String(now) }) };
    },
    setInterval: (callback, interval) => timers.push({ callback, interval, next: now + interval }),
    $: () => ({ classList: { add() {}, remove() {} }, textContent: "" }),
    loadUsageCache: () => null, saveUsageCache() {},
    populateNodes() {}, populateModels() {}, populateFolders() {}, syncQuotaClock() {},
    render: () => renders.push(state.data.generatedAt), toast() {}, t: (key) => key,
  });
  vm.runInContext(`${constants}\n${loading}\n${polling}`, context);
  const flush = () => new Promise((resolve) => setImmediate(resolve));
  return {
    state, requests, renders,
    load: (force = false) => vm.runInContext(`loadData(${force})`, context),
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
  assert.equal(ui.requests.length, 16);
  assert.equal(ui.renders.length, 16);
});

test("visible dashboards check for new data every five seconds in both modes", async () => {
  for (const mode of ["local", "centralized"]) {
    const ui = dashboard({ mode });
    await ui.advance(4_999);
    assert.equal(ui.requests.length, 0);
    await ui.advance(1);
    assert.equal(ui.renders.length, 1, mode);
    await ui.advance(10_000);
    assert.equal(ui.renders.length, 3, mode);
    assert.equal(ui.requests.filter((url) => url.startsWith("/api/usage?")).length, 3);
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
    await ui.advance(5_000);
    assert.equal(ui.state.data?.generatedAt, "recovered", mode);
    assert.deepEqual(ui.renders, ["recovered"]);
  }
});

test("hidden tabs pause polling and immediately refresh when visible again", async () => {
  const ui = dashboard();
  await ui.advance(5_000);
  await ui.visible(false);
  await ui.advance(20_000);
  assert.equal(ui.requests.length, 1);
  await ui.visible(true);
  assert.equal(ui.requests.length, 2);
  // A second return within the old centralized throttle must not latch the request lock.
  await ui.visible(false);
  await ui.visible(true);
  await ui.advance(5_000);
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
  assert.deepEqual(ui.requests.slice(2), ["/api/health", "/api/usage?source=local"]);
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
  await ui.advance(15_000);
  const manual = ui.load(true);
  assert.equal(ui.requests.length, 1);
  respond({ ok: true, json: async () => ({ generatedAt: "updated" }) });
  await Promise.all([first, manual]);
  assert.deepEqual(ui.renders, ["updated"]);
  await ui.load(true);
  assert.equal(ui.requests.at(-1), "/api/usage?source=centralized&refresh=1");
  await ui.advance(5_000);
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
      await ui.advance(5_000);
      assert.equal(ui.state.data.generatedAt, "recovered", mode);
    }
  }
});
