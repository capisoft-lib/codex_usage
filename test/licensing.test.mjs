import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("publishes the complete project as AGPL-3.0-or-later free software", async () => {
  const [license, packageSource, dockerfile, readme, contributing] = await Promise.all([
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
    readFile(new URL("../CONTRIBUTING.md", import.meta.url), "utf8"),
  ]);
  const packageJson = JSON.parse(packageSource);

  assert.match(license, /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3, 19 November 2007/);
  assert.match(license, /13\. Remote Network Interaction/);
  assert.equal(packageJson.license, "AGPL-3.0-or-later");
  assert.match(dockerfile, /org\.opencontainers\.image\.licenses="AGPL-3\.0-or-later"/);
  assert.match(dockerfile, /COPY --chown=node:node package\.json server\.mjs LICENSE/);
  assert.match(readme, /Copyright © 2026 capisoft-lib and contributors/);
  assert.match(readme, /free software licensed under \[GNU AGPL version 3 or any later version\]\(LICENSE\)/);
  assert.doesNotMatch(readme, /No open-source license has been selected/i);
  assert.match(contributing, /license it under `AGPL-3\.0-or-later`/);
});

test("uses original project branding and exposes source to network users", async () => {
  const [icon, html, app, translations] = await Promise.all([
    readFile(new URL("../public/icon.svg", import.meta.url), "utf8"),
    readFile(new URL("../public/index.html", import.meta.url), "utf8"),
    readFile(new URL("../public/app.js", import.meta.url), "utf8"),
    readFile(new URL("../public/translations.js", import.meta.url), "utf8"),
  ]);

  assert.match(icon, /original local analytics mark/i);
  assert.doesNotMatch(icon, /OpenAI|monoblossom|developers\.openai\.com\/assets|M304\.246/i);
  assert.match(html, /href="https:\/\/github\.com\/capisoft-lib\/codex_usage" data-i18n="license\.source">Code source<\/a>/);
  assert.match(html, /rel="license">AGPL-3\.0-or-later<\/a>/);
  assert.match(html, /<strong>Local Usage<\/strong>/);
  assert.doesNotMatch(`${app}\n${translations}`, /"app\.title": "Codex Usage/);
});
