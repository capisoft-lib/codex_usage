import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const require = createRequire(import.meta.url);
// Resolve the dependency from its actual consumer, rather than testing a copy
// that might differ from the package used by the build and lint tools.
const consumerRequire = createRequire(require.resolve("micromatch"));
const braces = consumerRequire("braces");
const micromatch = require("micromatch");
const fastGlob = require("fast-glob");
const bounded = error => error instanceof SyntaxError && error.code === "ERR_BRACES_MAX_DEPTH";

test("glob consumers resolve the patched local package and retain normal behavior", async () => {
  assert.equal(consumerRequire("braces/package.json").name, "@codex-usage/braces-safe");
  assert.equal(consumerRequire("braces/package.json").version, "3.0.3-patch.1");
  const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
  assert.equal(lock.packages["node_modules/braces"].resolved, "vendor/braces");
  assert.equal(lock.packages["node_modules/braces"].link, true);
  assert.deepEqual(braces.expand("src/{one,two}/{1..3}.js"), ["src/one/1.js", "src/one/2.js", "src/one/3.js", "src/two/1.js", "src/two/2.js", "src/two/3.js"]);
  assert.deepEqual(braces.expand("{a,{b,c}}"), ["a", "b", "c"]);
  assert.equal(braces.stringify(braces.parse("src/{a,b}.js")), "src/{a,b}.js");
  assert.equal(braces.stringify("\\{literal\\}"), "{literal}");
  assert.deepEqual(micromatch(["one.ts", "two.tsx", "three.js"], "*.{ts,tsx}"), ["one.ts", "two.tsx"]);
  const files = await fastGlob("app/**/{layout,page}.{ts,tsx}", { cwd: fileURLToPath(new URL("..", import.meta.url)), onlyFiles: true });
  assert.ok(files.includes("app/layout.tsx"));
  assert.ok(files.includes("app/page.tsx"));
});

test("deep and unclosed patterns fail before reaching recursive walkers", () => {
  const patterns = [
    "{".repeat(4500) + "a,b" + "}".repeat(4500),
    "(".repeat(4500) + "a" + ")".repeat(4500),
    "{(".repeat(2250) + "a,b" + ")}".repeat(2250),
    "{".repeat(4500) + "a,b",
    "(".repeat(4500) + "a",
  ];
  for (const pattern of patterns) {
    for (const api of [braces, braces.parse, braces.create, braces.compile, braces.expand, braces.stringify]) {
      assert.throws(() => api(pattern), bounded);
      assert.throws(() => api(pattern, { maxDepth: Infinity, maxLength: Infinity }), bounded);
    }
  }
  // Realistic nesting still works, including both block types.
  const normal = "{".repeat(24) + "a,b" + "}".repeat(24);
  assert.doesNotThrow(() => braces.compile(normal));
  assert.doesNotThrow(() => braces.expand(normal));
});

test("caller-provided deep and cyclic ASTs are bounded independently of parsing", () => {
  for (const api of [braces.compile, braces.expand, braces.stringify]) {
    const root = { type: "root", nodes: [] };
    let current = root;
    for (let i = 0; i < 2000; i++) {
      const child = { type: "brace", nodes: [] };
      current.nodes.push(child);
      current = child;
    }
    assert.throws(() => api(root), bounded);
    const cyclic = { type: "root", nodes: [] };
    cyclic.nodes.push(cyclic);
    assert.throws(() => api(cyclic), bounded);
  }
});
