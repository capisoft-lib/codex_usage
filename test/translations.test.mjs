import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { ADDITIONAL_I18N, LOCALE_TAGS, resolveLanguage } from "../public/translations.js";

const expectedLanguages = ["fr", "en", "de", "es", "it", "pt", "ja", "ru", "zh"];
const dynamicKeys = [
  "period.todayLabel",
  "period.7dLabel",
  "period.30dLabel",
  "period.allLabel",
  "effort.low",
  "effort.medium",
  "effort.high",
  "effort.xhigh",
  "effort.minimal",
  "effort.max",
  "effort.ultra",
];

function messageKeysIn(source) {
  return [...source.matchAll(/\bt\(\s*["']([^"']+)["']/g)].map((match) => match[1]);
}

function attributeKeysIn(source) {
  return [...source.matchAll(/data-i18n(?:-placeholder|-aria)?="([^"]+)"/g)].map((match) => match[1]);
}

function placeholdersIn(message) {
  return [...String(message).matchAll(/\{\w+\}/g)].map((match) => match[0]).sort();
}

test("exposes the nine supported languages in the selector and locale map", async () => {
  const html = await readFile(new URL("../public/index.html", import.meta.url), "utf8");
  const optionLanguages = [...html.matchAll(/<option value="([a-z]{2})">[A-Z]{2}<\/option>/g)].map((match) => match[1]);

  assert.deepEqual(optionLanguages, expectedLanguages);
  assert.deepEqual(Object.keys(LOCALE_TAGS), expectedLanguages);
  assert.deepEqual(Object.keys(ADDITIONAL_I18N), expectedLanguages.slice(3));
});

test("resolves exact, regional, and browser language preferences", () => {
  assert.equal(resolveLanguage("es-MX"), "es");
  assert.equal(resolveLanguage("pt_BR"), "pt");
  assert.equal(resolveLanguage("zh-Hans-CN"), "zh");
  assert.equal(resolveLanguage(["ko-KR", "ja-JP"]), "ja");
  assert.equal(resolveLanguage("ru"), "ru");
  assert.equal(resolveLanguage("unknown"), "fr");
});

test("fully translates every label used by the runtime", async () => {
  const [app, html] = await Promise.all([
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
  ]);
  const requiredKeys = [...new Set([...messageKeysIn(app), ...attributeKeysIn(html), ...dynamicKeys])].sort();
  const englishBody = app.match(/\n  en: \{([\s\S]*?)\n  \},\n  de:/)?.[1];
  assert.ok(englishBody, "English reference catalogue not found");
  const english = vm.runInNewContext(`({${englishBody}\n})`);

  for (const [language, messages] of Object.entries(ADDITIONAL_I18N)) {
    const missing = requiredKeys.filter((key) => !Object.hasOwn(messages, key));
    assert.deepEqual(missing, [], `${language} is missing runtime translations`);
    for (const key of requiredKeys) {
      assert.deepEqual(placeholdersIn(messages[key]), placeholdersIn(english[key]), `${language}.${key} must preserve placeholders`);
    }
  }
});
