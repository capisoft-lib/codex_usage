import assert from "node:assert/strict";
import test from "node:test";
import { parseAgentOptions } from "../src/agent-options.mjs";

test("association command maps only explicit CLI values to agent configuration", () => {
  const result = parseAgentOptions([
    "--hub-url", "https://mesh.example",
    "--associate", "AAAA-BBBB",
    "--alias", "PC Bureau",
  ], { EXISTING: "kept" });
  assert.equal(result.env.MESH_HUB_URL, "https://mesh.example");
  assert.equal(result.env.MESH_ENROLLMENT_CODE, "AAAA-BBBB");
  assert.equal(result.env.MESH_NODE_ALIAS, "PC Bureau");
  assert.equal(result.env.EXISTING, "kept");
  assert.equal(result.help, false);
  assert.equal(result.once, false);
});

test("one-shot installation mode is explicit and does not consume a value", () => {
  const result = parseAgentOptions(["--once", "--state-path", "C:\\state.json"], {});
  assert.equal(result.once, true);
  assert.equal(result.env.MESH_AGENT_STATE_PATH, "C:\\state.json");
});

test("association command rejects unknown and incomplete options", () => {
  assert.throws(() => parseAgentOptions(["--token", "secret"], {}), /Option inconnue/);
  assert.throws(() => parseAgentOptions(["--associate"], {}), /Valeur manquante/);
});

test("conversation titles require an explicit flag or existing environment setting", () => {
  assert.equal(parseAgentOptions([], {}).env.MESH_INCLUDE_TITLES, undefined);
  for (const value of ["false", "true"]) {
    const baseEnv = { MESH_INCLUDE_TITLES: value };
    assert.equal(parseAgentOptions([], baseEnv).env.MESH_INCLUDE_TITLES, value);
    const result = parseAgentOptions(["--include-titles", "--once", "--alias", "Office"], baseEnv);
    assert.equal(result.env.MESH_INCLUDE_TITLES, "true");
    assert.equal(result.once, true);
    assert.equal(result.env.MESH_NODE_ALIAS, "Office");
    assert.equal(baseEnv.MESH_INCLUDE_TITLES, value);
  }
});
