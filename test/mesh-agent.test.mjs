import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MeshAgent, readPersistedMeshHubUrl } from "../src/mesh-agent.mjs";
import { MeshHubStore } from "../src/mesh-hub-store.mjs";

function usageData() {
  const counters = { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13 };
  return {
    analyzerVersion: 3,
    generatedAt: new Date().toISOString(),
    source: { mode: "local", sessionsAvailable: true, archivedSessionsAvailable: false, sessionIndexAvailable: true },
    fiveHourQuota: { usedPercent: 15, remainingPercent: 85, windowMinutes: 300, resetsAt: new Date(Date.now() + 60_000).toISOString(), observedAt: new Date().toISOString(), planType: "pro" },
    weeklyQuota: { usedPercent: 20, remainingPercent: 80, windowMinutes: 10080, resetsAt: null, resetsAvailable: null, observedAt: new Date().toISOString(), planType: "pro" },
    weeklyQuotaHistory: [],
    sessions: [{
      id: "session-1", title: "Sensitive conversation", startedAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      cwd: "C:\\Users\\alice\\secret-project", source: "cli", cliVersion: null, modelProvider: null, models: ["gpt-test"],
      projectName: "secret-project", projectGitHubUrl: "https://github.com/example/secret-project",
      exchanges: 1, completedExchanges: 1, userMessages: 1, assistantMessages: 1, modelCalls: 1, durationMs: 1000,
      usage: counters, turns: [], calls: [{ timestamp: new Date().toISOString(), turnId: "turn-1", model: "gpt-test", effort: "medium", serviceTier: "default", usage: counters }], parseErrors: 0,
    }], errors: [],
  };
}

test("agent enrolls, signs minimized snapshots, and only resends changes", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-agent-"));
  const store = new MeshHubStore();
  const enrollment = await store.createEnrollment();
  const requests = [];
  const fetchImpl = async (url, options) => {
    requests.push({ url, body: options.body, headers: options.headers });
    try {
      if (url.endsWith("/enroll")) return Response.json(await store.enroll(JSON.parse(options.body)), { status: 201 });
      if (url.endsWith("/ingest")) return Response.json(await store.ingest(JSON.parse(options.body)), { status: 202 });
      if (url.endsWith("/usage")) return Response.json(await store.readUsage(JSON.parse(options.body)));
      return Response.json({ error: "not found" }, { status: 404 });
    } catch (error) {
      return Response.json({ error: error.message, code: error.code }, { status: error.status || 500 });
    }
  };
  const agent = new MeshAgent({ hubUrl: "https://mesh.example", alias: "PC Bureau", statePath: path.join(directory, "agent.json"), enrollmentCode: enrollment.code, fetchImpl, logger: { log() {} } });
  const data = usageData();
  const first = await agent.sync(data);
  const second = await agent.sync(data);
  assert.equal(first.accepted, 1);
  assert.equal(second.accepted, 0);
  const centralized = await agent.centralizedUsage();
  assert.equal(centralized.sessions[0].nodeAlias, "PC Bureau");
  assert.equal(requests.filter((request) => request.url.endsWith("/enroll")).length, 1);
  assert.ok(requests.every((request) => request.headers["content-type"] === "application/json"));
  assert.ok(requests.every((request) => !Object.keys(request.headers).some((name) => name.toLowerCase() === "oai-sites-authorization")));
  const aggregated = store.aggregate();
  assert.equal(aggregated.fiveHourQuota.remainingPercent, 85);
  assert.equal(aggregated.sessions.length, 1);
  assert.match(aggregated.sessions[0].title, /^Conversation /);
  assert.match(aggregated.sessions[0].cwd, /^project-/);
  assert.equal(aggregated.sessions[0].projectName, "secret-project");
  assert.equal(aggregated.sessions[0].projectGitHubUrl, "https://github.com/example/secret-project");
  assert.equal(JSON.stringify(aggregated).includes("alice"), false);
  const state = JSON.parse(await readFile(path.join(directory, "agent.json"), "utf8"));
  assert.equal(state.sequence, 3);
  assert.equal(state.nodeId, aggregated.nodes[0].id);
  assert.equal(state.hubUrl, "https://mesh.example");
  assert.equal(await readPersistedMeshHubUrl(path.join(directory, "agent.json")), "https://mesh.example");
});

test("agent uses the operating-system hostname when no alias override is configured", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-hostname-"));
  const agent = new MeshAgent({
    hubUrl: "https://mesh.example",
    statePath: path.join(directory, "agent.json"),
    hostnameImpl: () => "WORKSTATION-42",
  });
  await agent.load();
  assert.equal(agent.status().alias, "WORKSTATION-42");
  assert.equal(agent.state.alias, "WORKSTATION-42");
});

test("agent preserves batched sync with legacy hubs and detects a later hub upgrade", async (t) => {
  for (const code of ["mesh_invalid", undefined]) {
    for (const hasQuota of [true, false]) {
      await t.test(`${code || "Sites"}, quota ${hasQuota ? "present" : "absent"}`, async () => {
        const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-legacy-"));
        const store = new MeshHubStore();
        const enrollment = await store.createEnrollment();
        let legacy = true;
        const requests = [];
        const fetchImpl = async (url, options) => {
          if (url.endsWith("/enroll")) return Response.json(await store.enroll(JSON.parse(options.body)));
          const envelope = JSON.parse(options.body);
          requests.push(envelope);
          if (legacy && Object.hasOwn(envelope.payload, "shortQuota")) {
            return Response.json({ error: "Charge utile Mesh invalide.", code }, { status: 400 });
          }
          return Response.json(await store.ingest(envelope));
        };
        const options = { hubUrl: "https://mesh.example", alias: "PC", statePath: path.join(directory, "agent.json"), enrollmentCode: enrollment.code, batchSize: 1, fetchImpl, logger: { log() {} } };
        const agent = new MeshAgent(options);
        const data = usageData();
        if (!hasQuota) data.fiveHourQuota = null;
        data.sessions.push({ ...data.sessions[0], id: "session-2" });
        const result = await agent.sync(data);
        assert.equal(result.accepted, 2);
        assert.equal(result.batches, 2);
        assert.deepEqual(requests.map((request) => request.sequence), [1, 2, 3]);
        assert.ok(requests.slice(1).every((request) => !Object.hasOwn(request.payload, "shortQuota")));
        const { shortQuota, ...legacyPayload } = requests[0].payload;
        assert.deepEqual(requests[1].payload, legacyPayload);
        assert.notEqual(requests[0].signature, requests[1].signature);
        assert.equal(store.aggregate().sessions.length, 2);
        assert.equal(store.aggregate().weeklyQuota.remainingPercent, 80);
        assert.equal(Object.keys(agent.state.sessionHashes).length, 2);

        // Upgrading the hub must enable the quota without re-enrollment.
        legacy = false;
        const restarted = new MeshAgent({ ...options, enrollmentCode: null });
        const next = await restarted.sync(data);
        assert.equal(next.accepted, 0);
        assert.equal(requests.length, 4);
        assert.equal(requests[3].sequence, 4);
        assert.deepEqual(requests[3].payload.shortQuota, shortQuota);
        assert.equal(store.aggregate().fiveHourQuota?.remainingPercent ?? null, hasQuota ? 85 : null);
        assert.equal(restarted.state.nodeId, agent.state.nodeId);
      });
    }
  }
});

test("legacy fallback never retries authentication, quota validation, transport, or server failures", async (t) => {
  const failures = [
    ...[401, 403, 409, 413, 503].map((status) => ({ status, error: "Charge utile Mesh invalide.", code: "mesh_invalid" })),
    { status: 400, error: "Quota court Mesh invalide." },
    { status: 400, error: "Une session Mesh est invalide." },
    { status: 400, error: "Charge utile Mesh invalide.", code: "another_error" },
    { error: "network unavailable" },
  ];
  for (const failure of failures) {
    await t.test(`${failure.status || "network"}: ${failure.code || failure.error}`, async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-no-fallback-"));
      let requests = 0;
      const agent = new MeshAgent({
        hubUrl: "https://mesh.example", alias: "PC", statePath: path.join(directory, "agent.json"),
        fetchImpl: async () => {
          requests++;
          if (!failure.status) throw new Error(failure.error);
          return Response.json({ error: failure.error, code: failure.code }, { status: failure.status });
        },
      });
      await agent.load();
      agent.state.nodeId = "node_test";
      await assert.rejects(() => agent.sync(usageData()), (error) => error.message === failure.error);
      assert.equal(requests, 1);
      assert.deepEqual(agent.state.sessionHashes, {});
      assert.equal(agent.state.lastSyncAt, null);
      assert.equal(JSON.parse(await readFile(agent.statePath, "utf8")).sequence, 1);
    });
  }
});

test("an unsuccessful legacy retry stops without acknowledging sessions", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-retry-failure-"));
  const requests = [];
  const agent = new MeshAgent({
    hubUrl: "https://mesh.example", alias: "PC", statePath: path.join(directory, "agent.json"),
    fetchImpl: async (_url, options) => {
      requests.push(JSON.parse(options.body));
      return Response.json({ error: "Charge utile Mesh invalide." }, { status: 400 });
    },
  });
  await agent.load();
  agent.state.nodeId = "node_test";
  await assert.rejects(() => agent.sync(usageData()), /Charge utile Mesh invalide/);
  assert.deepEqual(requests.map((request) => request.sequence), [1, 2]);
  assert.equal(Object.hasOwn(requests[1].payload, "shortQuota"), false);
  assert.deepEqual(agent.state.sessionHashes, {});
  assert.equal(agent.state.lastSyncAt, null);
});

test("agent never reuses a reserved sequence after an interrupted request", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-sequence-"));
  const sequences = [];
  let fail = true;
  const agent = new MeshAgent({
    hubUrl: "https://mesh.example",
    statePath: path.join(directory, "agent.json"),
    fetchImpl: async (_url, options) => {
      sequences.push(JSON.parse(options.body).sequence);
      if (fail) {
        fail = false;
        return Response.json({ error: "interrupted" }, { status: 503 });
      }
      return Response.json({ accepted: true });
    },
  });
  await agent.load();
  agent.state.nodeId = "node_test";
  await agent.persist();
  await assert.rejects(() => agent.sendSigned("/api/mesh/usage", { kind: "read", requestVersion: 1 }), /interrupted/);
  const persisted = JSON.parse(await readFile(path.join(directory, "agent.json"), "utf8"));
  assert.equal(persisted.sequence, 1);
  await agent.sendSigned("/api/mesh/usage", { kind: "read", requestVersion: 1 });
  assert.deepEqual(sequences, [1, 2]);
});

test("agent recovers a stale counter once without weakening hub replay protection", async (t) => {
  for (const body of [{ error: "Séquence déjà traitée." }, { error: "Séquence Mesh déjà traitée.", code: "mesh_replay" }]) {
    await t.test(body.code || "Sites legacy response", async () => {
      const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-replay-"));
      const requests = [];
      const floor = Date.now() - 1000;
      const agent = new MeshAgent({
        hubUrl: "https://mesh.example", statePath: path.join(directory, "agent.json"),
        fetchImpl: async (_url, options) => {
          const envelope = JSON.parse(options.body);
          requests.push(envelope);
          const persisted = JSON.parse(await readFile(agent.statePath, "utf8"));
          assert.equal(persisted.sequence, envelope.sequence, "reserve before every transmission");
          return envelope.sequence <= floor ? Response.json(body, { status: 409 }) : Response.json({ accepted: true });
        },
      });
      await agent.load(); agent.state.nodeId = "node_test";
      const payload = { kind: "read", requestVersion: 1 };
      await agent.sendSigned("/api/mesh/usage", payload);
      assert.equal(requests.length, 2);
      assert.equal(requests[0].sequence, 1);
      assert.ok(requests[1].sequence > floor);
      assert.deepEqual(requests[1].payload, payload);
      const { verifySignedEnvelope } = await import("../src/mesh-protocol.mjs");
      verifySignedEnvelope(requests[1], agent.state.publicKey);
      const recovered = agent.state.sequence;
      await agent.sendSigned("/api/mesh/usage", payload);
      assert.equal(requests[2].sequence, recovered + 1);
    });
  }
});

test("replay recovery is bounded and does not rewind a counter ahead of the clock", async () => {
  for (const initial of [0, Date.now() + 60_000]) {
    const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-replay-limit-"));
    let attempts = 0;
    const agent = new MeshAgent({
      hubUrl: "https://mesh.example", statePath: path.join(directory, "agent.json"),
      fetchImpl: async () => { attempts++; return Response.json({ error: "Séquence déjà traitée." }, { status: 409 }); },
    });
    await agent.load(); agent.state.nodeId = "node_test"; agent.state.sequence = initial;
    await assert.rejects(agent.sendSigned("/api/mesh/usage", { kind: "read", requestVersion: 1 }), /Séquence déjà traitée/);
    assert.equal(attempts, initial ? 1 : 2);
    assert.ok(agent.state.sequence > initial);
    const persisted = JSON.parse(await readFile(agent.statePath, "utf8"));
    assert.equal(persisted.sequence, agent.state.sequence);
  }
});

test("hub rejects unexpected private fields before storing a snapshot", async () => {
  const store = new MeshHubStore();
  const enrollment = await store.createEnrollment();
  const directory = await mkdtemp(path.join(os.tmpdir(), "codex-mesh-agent-"));
  const agent = new MeshAgent({ hubUrl: "https://unused", alias: "PC", statePath: path.join(directory, "agent.json"), enrollmentCode: enrollment.code });
  await agent.load();
  const node = await store.enroll({ code: enrollment.code, alias: "PC", publicKey: agent.state.publicKey });
  const { createSignedEnvelope } = await import("../src/mesh-protocol.mjs");
  const data = usageData();
  const session = { ...data.sessions[0], unexpectedSecret: "do-not-store" };
  const envelope = createSignedEnvelope({ nodeId: node.nodeId, sequence: 1, privateKey: agent.state.privateKey, payload: { kind: "sync", snapshotVersion: 1, analyzerVersion: 3, generatedAt: data.generatedAt, privacy: { projectMode: "hash", includeTitles: false }, quota: null, upserts: [session], removals: [] } });
  await assert.rejects(() => store.ingest(envelope), /session Mesh est invalide/);
  assert.equal(store.aggregate().sessions.length, 0);
});
