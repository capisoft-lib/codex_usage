import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render(headers = {}) {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", ...headers },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the private ChatGPT sign-in boundary", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Codex Usage Mesh<\/title>/i);
  assert.match(html, /Votre usage Codex, réuni en privé/);
  assert.match(html, /signin-with-chatgpt/);
  assert.doesNotMatch(html, /PC Bureau|Portable|124,82/);
});

test("redirects an authenticated owner to the shared dashboard", async () => {
  const response = await render({
    "oai-authenticated-user-id": "owner-test",
    "oai-authenticated-user-email": "owner@example.test",
  });
  assert.ok([307, 308].includes(response.status));
  assert.equal(new URL(response.headers.get("location"), "http://localhost").pathname, "/dashboard/index.html");
});

test("packages the local dashboard as the hosted centralized interface", async () => {
  const html = await readFile(new URL("../public/dashboard/index.html", import.meta.url), "utf8");
  const app = await readFile(new URL("../public/dashboard/app.js", import.meta.url), "utf8");
  const manifest = JSON.parse(await readFile(new URL("../public/dashboard/bundle-manifest.json", import.meta.url), "utf8"));
  assert.match(html, /data-page="overview"/);
  assert.match(html, /href="\.\/styles\.css"/);
  assert.match(html, /href="\.\/manifest\.webmanifest"/);
  assert.match(html, /id="pwaInstallButton"/);
  assert.match(html, /id="pwaInstallToast"/);
  assert.match(html, /href="\/admin"/);
  assert.match(app, /\/api\/capabilities/);
  assert.match(app, /\/api\/usage/);
  assert.doesNotMatch(app, /\/api\/centralized-usage/);
  assert.equal(manifest.version, 1);
  assert.equal(Object.keys(manifest.assets).length, 19);
  assert.ok(manifest.assets["pricing-catalog.js"]);
  assert.ok(manifest.assets["pricing-ui.js"]);
  assert.match(html, /id="pricingMode"/);
  assert.ok(manifest.assets["manifest.webmanifest"]);
  assert.ok(manifest.assets["sw.js"]);
  assert.ok(manifest.assets["project-identity.js"]);
});
