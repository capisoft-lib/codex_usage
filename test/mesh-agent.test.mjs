import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { MeshAgent } from "../src/mesh-agent.mjs";
import { MeshHubStore } from "../src/mesh-hub-store.mjs";

function usageData() {
  const counters = { inputTokens: 10, cachedInputTokens: 2, outputTokens: 3, reasoningOutputTokens: 1, totalTokens: 13 };
  return {
    analyzerVersion: 3,
    generatedAt: new Date().toISOString(),
    source: { mode: "local", sessionsAvailable: true, archivedSessionsAvailable: false, sessionIndexAvailable: true },
    weeklyQuota: { usedPercent: 20, remainingPercent: 80, windowMinutes: 10080, resetsAt: null, resetsAvailable: null, observedAt: new Date().toISOString(), planType: "pro" },
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
  const agent = new MeshAgent({ hubUrl: "https://mesh.example", alias: "PC Bureau", statePath: path.join(directory, "agent.json"), enrollmentCode: enrollment.code, sitesBypassToken: "private-sites-token", fetchImpl, logger: { log() {} } });
  const data = usageData();
  const first = await agent.sync(data);
  const second = await agent.sync(data);
  assert.equal(first.accepted, 1);
  assert.equal(second.accepted, 0);
  const centralized = await agent.centralizedUsage();
  assert.equal(centralized.sessions[0].nodeAlias, "PC Bureau");
  assert.equal(requests.filter((request) => request.url.endsWith("/enroll")).length, 1);
  assert.ok(requests.every((request) => request.headers["OAI-Sites-Authorization"] === "Bearer private-sites-token"));
  const aggregated = store.aggregate();
  assert.equal(aggregated.sessions.length, 1);
  assert.match(aggregated.sessions[0].title, /^Conversation /);
  assert.match(aggregated.sessions[0].cwd, /^project-/);
  assert.equal(aggregated.sessions[0].projectName, "secret-project");
  assert.equal(aggregated.sessions[0].projectGitHubUrl, "https://github.com/example/secret-project");
  assert.equal(JSON.stringify(aggregated).includes("alice"), false);
  const state = JSON.parse(await readFile(path.join(directory, "agent.json"), "utf8"));
  assert.equal(state.sequence, 3);
  assert.equal(state.nodeId, aggregated.nodes[0].id);
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
