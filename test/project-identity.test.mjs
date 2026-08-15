import assert from "node:assert/strict";
import test from "node:test";
import { OVERVIEW_PROJECT_LIMIT, projectIdentity } from "../public/project-identity.js";

test("groups projects by GitHub URL before the local project name", () => {
  const left = projectIdentity({ id: "one", projectName: "Desktop", projectGitHubUrl: "https://github.com/example/shared" });
  const right = projectIdentity({ id: "two", projectName: "Container", projectGitHubUrl: "https://github.com/example/shared" });
  assert.equal(left.key, right.key);
  assert.equal(left.name, "Desktop");
});

test("falls back to a normalized project name", () => {
  assert.equal(projectIdentity({ id: "one", projectName: "SewKeep" }).key, projectIdentity({ id: "two", projectName: "sewkeep" }).key);
});

test("keeps unnamed projects separate and never displays privacy hashes", () => {
  const left = projectIdentity({ id: "one", nodeId: "pc", cwd: "project-123456789abc" }, "Nouveau projet");
  const right = projectIdentity({ id: "two", nodeId: "pc", cwd: "project-123456789abc" }, "Nouveau projet");
  assert.notEqual(left.key, right.key);
  assert.equal(left.name, "Nouveau projet");
});

test("overview project count is capped at five", () => {
  assert.equal(OVERVIEW_PROJECT_LIMIT, 5);
});
