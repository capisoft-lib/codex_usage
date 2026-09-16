import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readSessionSlices } from "../../src/storage/relational-reader.mjs";

test("real workerd D1 supports relational migrations, atomic ingest and grouped reads", async () => {
  const mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: 'export default { fetch() { return new Response("ok"); } }',
      compatibilityDate: "2026-08-01",
      d1Databases: ["DB"],
    }),
  );
  try {
    const db = await mf.getD1Database("DB");
    const directory = new URL("../drizzle/", import.meta.url);
    for (const file of (await readdir(directory))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      const sql = await readFile(new URL(file, directory), "utf8");
      await db.batch(
        sql
          .split("--> statement-breakpoint")
          .map((s) => s.trim())
          .filter(Boolean)
          .map((s) => db.prepare(s)),
      );
    }
    await db
      .prepare(
        `INSERT INTO mesh_nodes(id,owner_id,alias,public_key,fingerprint,enrolled_at,privacy_json) VALUES('n','owner','PC','key','fp','2026-01-01','{}')`,
      )
      .run();
    const call = {
      timestamp: "2026-09-10T00:00:00Z",
      model: "gpt-5.6-sol",
      usage: {
        inputTokens: 1000,
        cachedInputTokens: 900,
        outputTokens: 10,
        totalTokens: 1010,
      },
    };
    const session = {
      id: "s",
      models: ["gpt-5.6-sol"],
      calls: Array.from({ length: 1000 }, () => call),
      turns: [],
    };
    const insert = () =>
      db
        .prepare(
          `INSERT INTO mesh_sessions(node_id,session_id,snapshot_json) VALUES('n','s',?)
      ON CONFLICT(node_id,session_id) DO UPDATE SET snapshot_json=excluded.snapshot_json`,
        )
        .bind(JSON.stringify(session));
    await insert().run();
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM usage_calls").first()).n,
      1000,
    );
    const rows = [];
    await readSessionSlices(
      db,
      "owner",
      "2026-09-10",
      "2026-09-11",
      false,
      null,
      (row) => rows.push(JSON.parse(row.snapshot_json)),
      false,
      { aggregate: true },
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].calls.length, 1);
    assert.equal(rows[0].calls[0]._count, 1000);
    session.calls.push({ ...call, timestamp: "2026-09-10T01:00:00Z" });
    const update = await insert().run();
    // An appended event must not rewrite the 1000 unchanged relational rows.
    assert.ok(update.meta.rows_written < 50, JSON.stringify(update.meta));
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM usage_calls").first()).n,
      1001,
    );
    await assert.rejects(
      db.batch([
        db.prepare("DELETE FROM mesh_sessions WHERE node_id='n'"),
        db.prepare(
          "INSERT INTO usage_calls(node_id,session_id,ordinal,model,service_tier) VALUES('missing','missing',0,'unknown','default')",
        ),
      ]),
    );
    assert.equal(
      (await db.prepare("SELECT COUNT(*) n FROM usage_calls").first()).n,
      1001,
    );
  } finally {
    await mf.dispose();
  }
});
