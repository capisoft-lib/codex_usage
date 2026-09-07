import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/theme-sync.js", import.meta.url), "utf8");
const tick = () => new Promise((resolve) => setImmediate(resolve));
function page(remote, pathname = "/dashboard/index.html") {
  const document = new EventTarget();
  let theme = "blue";
  const writes = [];
  const manager = {
    themes: ["green", "blue", "violet", "amber"].map((id) => ({ id })),
    getTheme: () => theme,
    setTheme(value) { theme = value; document.dispatchEvent(new CustomEvent("dashboardthemechange", { detail: value })); },
  };
  vm.runInNewContext(source, { document, location: { pathname }, CodexUsageThemes: manager,
    fetch: async (_, options) => {
      if (options.method === "PUT") { writes.push(JSON.parse(options.body).theme); return { ok: true }; }
      return { ok: true, json: async () => ({ theme: await remote }) };
    },
  });
  return { manager, writes };
}

test("hosted palette initializes from the owner without feedback writes", async () => {
  const view = page("violet");
  await tick();
  assert.equal(view.manager.getTheme(), "violet");
  assert.deepEqual(view.writes, []);
  view.manager.setTheme("amber");
  await tick();
  assert.deepEqual(view.writes, ["amber"]);
});

test("first hosted visit migrates the existing palette; local dashboards never sync", async () => {
  const hosted = page(null);
  const local = page(null, "/index.html");
  await tick();
  assert.deepEqual(hosted.writes, ["blue"]);
  local.manager.setTheme("amber");
  await tick();
  assert.deepEqual(local.writes, []);
});

test("a slow restore cannot overwrite a newer user selection", async () => {
  let resolve;
  const view = page(new Promise((done) => { resolve = done; }));
  view.manager.setTheme("amber");
  resolve("green");
  await tick();
  assert.equal(view.manager.getTheme(), "amber");
  assert.deepEqual(view.writes, ["amber"]);
});
