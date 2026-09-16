import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const image =
  process.env.STORAGE_TEST_IMAGE || "codex-usage-dashboard:relational-test";
const name = `codex-relational-test-${process.pid}`,
  volume = `${name}-data`;
const docker = (...args) =>
  execFileSync("docker", args, { encoding: "utf8", timeout: 60000 }).trim();
const js = (source) =>
  docker("exec", name, "node", "--input-type=module", "-e", source);
let created = false,
  volumeCreated = false;
try {
  docker("volume", "create", volume);
  volumeCreated = true;
  const seed = `import {writeFileSync} from 'node:fs';
    const call={timestamp:'2026-09-10T00:00:00Z',model:'gpt-5.6-sol',usage:{inputTokens:1000,cachedInputTokens:900,outputTokens:10,totalTokens:1010}};
    const node={id:'test',alias:'Docker',publicKey:'key',fingerprint:'fp',enrolledAt:'2026-09-01',lastGeneratedAt:'2026-09-10',lastSequence:17,sessions:{s:{id:'s',startedAt:'2026-09-01',calls:[call,call],turns:[]}}};
    writeFileSync('/app-cache/mesh-hub.json',JSON.stringify({version:1,enrollments:{},nodes:{test:node}}));`;
  docker(
    "run",
    "--rm",
    "--mount",
    `type=volume,source=${volume},target=/app-cache`,
    image,
    "node",
    "--input-type=module",
    "-e",
    seed,
  );
  for (let iteration = 0; iteration < 2; iteration++) {
    docker(
      "run",
      "--detach",
      "--name",
      name,
      "--read-only",
      "--tmpfs",
      "/tmp",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges:true",
      "--mount",
      `type=volume,source=${volume},target=/app-cache`,
      "--env",
      "DASHBOARD_MODE=hub",
      "--env",
      "MESH_HUB_PATH=/app-cache/mesh-hub.json",
      image,
    );
    created = true;
    const result = JSON.parse(
      js(`let response;for(let i=0;i<30;i++){try{response=await fetch('http://127.0.0.1:4317/api/health');if(response.ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
      const query=encodeURIComponent(JSON.stringify({view:'overview',start:'2026-09-01',end:'2026-09-16'}));
      const page=await fetch('http://127.0.0.1:4317/api/page?query='+query);console.log(JSON.stringify({status:page.status,data:await page.json()}));`),
    );
    assert.equal(result.status, 200);
    assert.equal(result.data.pageData.totals.count, 2);
    const stored = JSON.parse(
      js(`import {DatabaseSync} from 'node:sqlite';const db=new DatabaseSync('/app-cache/mesh-hub.json.sqlite');
      console.log(JSON.stringify({calls:db.prepare('SELECT COUNT(*) n FROM usage_calls').get().n,sequence:db.prepare('SELECT last_sequence n FROM mesh_nodes').get().n,integrity:db.prepare('PRAGMA integrity_check').get().integrity_check}));db.close();`),
    );
    assert.deepEqual(stored, { calls: 2, sequence: 17, integrity: "ok" });
    docker("stop", name);
    docker("rm", name);
    created = false;
  }
  // Exercise the same image's local collector without mounting user data.
  docker(
    "run",
    "--detach",
    "--name",
    name,
    "--read-only",
    "--tmpfs",
    "/tmp",
    "--mount",
    `type=volume,source=${volume},target=/app-cache`,
    "--env",
    "CODEX_ACCOUNT_QUOTA_MODE=off",
    image,
  );
  created = true;
  const local = JSON.parse(
    js(
      `let data;for(let i=0;i<30;i++){try{const r=await fetch('http://127.0.0.1:4317/api/health');data=await r.json();if(data.ready)break;}catch{}await new Promise(r=>setTimeout(r,100));}console.log(JSON.stringify(data));`,
    ),
  );
  assert.equal(local.ready, true);
  assert.equal(local.mode, "local");
  console.log(
    "PASS: read-only Docker, JSON migration, relational API, container replacement with persisted identity/data, local collector.",
  );
} finally {
  if (created) docker("rm", "--force", name);
  if (volumeCreated) docker("volume", "rm", volume);
}
