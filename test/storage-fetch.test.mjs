import assert from "node:assert/strict";
import test from "node:test";
import { fetchUsage } from "../public/storage-fetch.js";

test("migration retries are bounded and never conceal other failures", async () => {
  let attempts = 0;
  const pending = () =>
    Response.json({ code: "storage_migrating" }, { status: 503 });
  const response = await fetchUsage(
    "/api/page",
    {},
    {
      delayMs: 0,
      fetchImpl: async () =>
        ++attempts < 3 ? pending() : Response.json({ ok: true }),
    },
  );
  assert.equal(response.status, 200);
  assert.equal(attempts, 3);
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
