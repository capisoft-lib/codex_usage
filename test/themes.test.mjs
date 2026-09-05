import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import { DASHBOARD_ASSETS } from "../scripts/dashboard-assets.mjs";
import { LOCALE_TAGS, THEME_I18N } from "../public/translations.js";

const source = readFileSync(new URL("../public/themes.js", import.meta.url), "utf8");
const css = readFileSync(new URL("../public/styles.css", import.meta.url), "utf8");
const key = "codex-usage-theme";

function browser({ saved, denied = false } = {}) {
  const values = new Map(saved === undefined ? [] : [[key, saved]]);
  const document = new EventTarget();
  document.documentElement = { dataset: {} };
  let browserColor;
  document.querySelector = () => ({ setAttribute: (_, value) => { browserColor = value; } });
  const listeners = new Map();
  const storage = {
    getItem: (name) => values.get(name) ?? null,
    setItem: (name, value) => values.set(name, value),
  };
  const context = vm.createContext({ document, CustomEvent, addEventListener: (name, handler) => listeners.set(name, handler) });
  Object.defineProperty(context, "localStorage", { get() {
    if (denied) throw new Error("Storage disabled");
    return storage;
  } });
  vm.runInContext(source, context);
  return {
    manager: context.CodexUsageThemes, document, values,
    get color() { return browserColor; },
    storageEvent: (eventKey, newValue, storageArea = storage) => listeners.get("storage")({ key: eventKey, newValue, storageArea }),
  };
}

test("restores valid preferences before paint and defaults invalid preferences to green", () => {
  for (const saved of [undefined, "", "removed-theme", "__proto__", "<script>"]) {
    const page = browser({ saved });
    assert.equal(page.manager.getTheme(), "green");
    assert.equal(page.document.documentElement.dataset.theme, "green");
    assert.equal(page.color, "#0e110f");
  }
  for (const theme of browser().manager.themes) {
    const page = browser({ saved: theme.id });
    assert.equal(page.manager.getTheme(), theme.id);
    assert.equal(page.document.documentElement.dataset.theme, theme.id);
    assert.equal(page.color, theme.color);
  }
});

test("selection updates document, browser color, subscribers and durable preference", () => {
  const page = browser();
  const changes = [];
  page.document.addEventListener("dashboardthemechange", (event) => changes.push(event.detail));
  page.manager.setTheme("violet");
  assert.equal(page.document.documentElement.dataset.theme, "violet");
  assert.equal(page.color, "#121019");
  assert.equal(page.values.get(key), "violet");
  assert.deepEqual(changes, ["violet"]);
  assert.equal(browser({ saved: page.values.get(key) }).manager.getTheme(), "violet");
  page.manager.setTheme("unknown");
  assert.equal(page.values.get(key), "green");
});

test("denied browser storage does not prevent startup or selecting a theme", () => {
  const page = browser({ denied: true });
  assert.equal(page.manager.getTheme(), "green");
  page.manager.setTheme("amber");
  assert.equal(page.document.documentElement.dataset.theme, "amber");
  assert.equal(page.color, "#15110c");
  assert.doesNotThrow(() => page.storageEvent(key, "blue"));
});

test("storage write failure preserves the tab's selection", () => {
  const page = browser();
  page.values.set = () => { throw new Error("Quota exceeded"); };
  page.manager.setTheme("blue");
  assert.equal(page.manager.getTheme(), "blue");
});

test("tabs follow theme changes/removal but ignore other storage and avoid feedback writes", () => {
  const page = browser({ saved: "violet" });
  page.storageEvent("codex-usage-language", "fr");
  page.storageEvent(key, "amber", {});
  assert.equal(page.manager.getTheme(), "violet");
  page.storageEvent(key, "blue");
  assert.equal(page.manager.getTheme(), "blue");
  assert.equal(page.values.get(key), "violet", "remote events must not write back");
  page.storageEvent(key, null);
  assert.equal(page.manager.getTheme(), "green");
  page.storageEvent(key, "amber");
  page.storageEvent(null, null);
  assert.equal(page.manager.getTheme(), "green");
});

function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}

test("every palette defines all base tokens and readable text and primary controls", () => {
  let baseKeys;
  for (const { id, color } of browser().manager.themes) {
    const block = css.match(new RegExp(`\\[data-theme="${id}"\\] \\{([^}]+)\\}`))?.[1];
    assert.ok(block, `missing ${id} palette`);
    const tokens = Object.fromEntries([...block.matchAll(/(--[\w-]+): (#[0-9a-f]{6});/g)].map((match) => [match[1], match[2]]));
    baseKeys ??= Object.keys(tokens).sort();
    assert.deepEqual(Object.keys(tokens).sort(), baseKeys, `${id} must not inherit colors from another theme`);
    assert.equal(tokens["--bg"], color, `${id} browser chrome must match its background`);
    for (const [fg, bg] of [["--text", "--surface"], ["--muted", "--surface"], ["--subtle", "--surface"], ["--on-accent", "--accent"]]) {
      const a = luminance(tokens[fg]);
      const b = luminance(tokens[bg]);
      assert.ok((Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) >= 4.5, `${id}: ${fg}/${bg} contrast`);
    }
    assert.equal(new Set([tokens["--accent"], tokens["--cached"], tokens["--output"], tokens["--writes"]]).size, 4);
  }
});

test("bootstrap is blocking, same-origin, and included in both bundle and offline shell", () => {
  const html = readFileSync(new URL("../public/index.html", import.meta.url), "utf8");
  const worker = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
  assert.match(html, /<script src="\.\/themes\.js"><\/script>\s*<link rel="stylesheet"/);
  assert.ok(DASHBOARD_ASSETS.includes("themes.js"));
  assert.match(worker, /"\.\/themes\.js"/);
});

test("all registered palettes and settings labels are translated in every supported language", () => {
  for (const language of Object.keys(LOCALE_TAGS)) {
    for (const name of ["appearance", "label", "copy", ...browser().manager.themes.map(({ id }) => id)]) {
      assert.ok(THEME_I18N[language]?.[`theme.${name}`]?.trim(), `${language}: theme.${name}`);
    }
  }
});
