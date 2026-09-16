import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fetchUsage } from "../public/storage-fetch.js";

test("migration retries are bounded and never conceal other failures", async () => {
  let attempts = 0;
  const migrationStates = [];
  const pending = () =>
    Response.json({ code: "storage_migrating" }, { status: 503 });
  const response = await fetchUsage(
    "/api/page",
    {},
    {
      delayMs: 0,
      onMigration: (active) => migrationStates.push(active),
      fetchImpl: async () =>
        ++attempts < 3 ? pending() : Response.json({ ok: true }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
  assert.deepEqual(migrationStates, [true, false]);
  attempts = 0;
  assert.equal(
    (
      await fetchUsage(
        "/api/page",
        {},
        {
          delayMs: 0,
          maxRetries: 2,
          fetchImpl: async () => {
            attempts++;
            return pending();
          },
        },
      )
    ).status,
    503,
  );
  assert.equal(attempts, 3);
  attempts = 0;
  await fetchUsage(
    "/api/page",
    {},
    {
      fetchImpl: async () => {
        attempts++;
        return Response.json({ error: "offline" }, { status: 503 });
      },
    },
  );
  assert.equal(attempts, 1);
  const controller = new AbortController();
  const request = fetchUsage(
    "/api/page",
    { signal: controller.signal },
    { fetchImpl: async () => pending() },
  );
  controller.abort();
  await assert.rejects(request, { name: "AbortError" });
});

test('migration dialog stays open until concurrent requests finish', () => {
  const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const elements = {
    '#migrationTitle': {}, '#migrationCopy': {},
    '#migrationDialog': { open: false, shows: 0, closes: 0,
      showModal() { this.open = true; this.shows++; },
      close() { this.open = false; this.closes++; } },
  };
  const context = vm.createContext({ $: (id) => elements[id], t: (key) => key });
  vm.runInContext(source.slice(source.indexOf('let migrationRequests ='), source.indexOf('const $$ =')), context);
  vm.runInContext('migrationChanged(true); migrationChanged(true); migrationChanged(false);', context);
  assert.equal(elements['#migrationDialog'].open, true);
  assert.equal(elements['#migrationDialog'].shows, 1);
  assert.equal(elements['#migrationTitle'].textContent, 'migration.title');
  vm.runInContext('migrationChanged(false)', context);
  assert.equal(elements['#migrationDialog'].open, false);
  assert.equal(elements['#migrationDialog'].closes, 1);
});
