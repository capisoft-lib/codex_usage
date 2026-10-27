// Run in the headless image with --network none. Uses only disposable fixtures.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { verifySignedEnvelope, validateSyncPayload } from "/app/src/mesh-protocol.mjs";

let publicKey, ingested = 0, failure;
const hub = createServer(async (request, response) => {
  try {
    let body = "";
    for await (const chunk of request) body += chunk;
    const data = JSON.parse(body);
    assert.equal(request.method, "POST");
    if (request.url === "/api/mesh/enroll") {
      assert.equal(data.code, "disposable-test");
      publicKey = data.publicKey;
      response.end(JSON.stringify({ nodeId: "container-smoke" }));
    } else {
      assert.equal(request.url, "/api/mesh/ingest");
      assert.ok(verifySignedEnvelope(data, publicKey));
      validateSyncPayload(data.payload);
      assert.deepEqual(data.payload.upserts, []);
      ingested++;
      response.end(JSON.stringify({ accepted: 0 }));
    }
  } catch (error) {
    failure = error;
    response.writeHead(400).end(JSON.stringify({ error: error.message }));
  }
});
hub.listen(0, "127.0.0.1");
await once(hub, "listening");
const child = spawn(process.execPath, ["/app/agent.mjs", "--once"], {
  env: { ...process.env, MESH_HUB_URL: `http://127.0.0.1:${hub.address().port}`,
    MESH_ENROLLMENT_CODE: "disposable-test", MESH_AGENT_STATE_PATH: "/tmp/agent-state.json",
    SNAPSHOT_PATH: "/tmp/usage.json" },
  stdio: ["ignore", "pipe", "pipe"],
});
let output = "";
child.stdout.on("data", data => { output += data; });
child.stderr.on("data", data => { output += data; });
const timer = setTimeout(() => child.kill(), 20_000);
try {
  const [code] = await once(child, "close");
  assert.equal(code, 0, output);
  if (failure) throw failure;
  assert.ok(ingested > 0, "agent must synchronize with the local fixture hub");
  const state = JSON.parse(await readFile("/tmp/agent-state.json", "utf8"));
  assert.equal(state.nodeId, "container-smoke");
  assert.ok(state.lastSyncAt);
  console.log(`PASS: ${process.arch} headless agent starts, enrolls, signs and synchronizes with an isolated fixture hub.`);
} finally {
  clearTimeout(timer);
  child.kill();
  hub.closeAllConnections();
  await new Promise(resolve => hub.close(resolve));
}
