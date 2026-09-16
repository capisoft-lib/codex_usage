import assert from "node:assert/strict";
import test from "node:test";
import { OVERVIEW_PROJECT_LIMIT, projectIdentity, automaticProjectGroups, collapseProjectCatalog } from "../public/project-identity.js";

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


test('automatically joins exact names to one repository and preserves raw identities', () => {
  const catalog = [projectIdentity({projectName:'SewKeep'}), projectIdentity({projectName:'SewKeep',projectGitHubUrl:'https://github.com/example/sewkeep'})];
  const groups = automaticProjectGroups(catalog);
  assert.equal(groups.length,1);
  assert.equal(collapseProjectCatalog(catalog,groups).length,1);
  assert.deepEqual(collapseProjectCatalog(catalog,groups)[0].members,groups[0].members);
  assert.equal(collapseProjectCatalog(catalog,[]).length,2);
  assert.equal(projectIdentity({projectName:'SewKeep'},'Unknown',groups).key, projectIdentity({projectName:'SewKeep',projectGitHubUrl:'https://github.com/example/sewkeep'},'Unknown',groups).key);
});

test('does not merge ambiguous repositories, approximate names or explicit groups', () => {
  const name = projectIdentity({projectName:'SewKeep'});
  const repo = projectIdentity({projectName:'SewKeep',projectGitHubUrl:'https://github.com/a/repo'});
  const other = projectIdentity({projectName:'SewKeep',projectGitHubUrl:'https://github.com/b/repo'});
  assert.equal(automaticProjectGroups([name,repo,other]).length,0);
  assert.equal(automaticProjectGroups([projectIdentity({projectName:'SewKeep DEV'}),repo]).length,0);
  assert.equal(automaticProjectGroups([name,repo],[{id:'manual',name:'Manual',members:[name.key,'name:other']}]).length,0);
  assert.equal(automaticProjectGroups([name,repo],[{id:'manual',name:'Manual',members:[repo.key,'name:other']}]).length,0);
  assert.equal(automaticProjectGroups([name,repo,other],[{id:'manual',name:'Manual',members:[other.key,'name:other']}]).length,0);
  assert.deepEqual(automaticProjectGroups([repo,name]),automaticProjectGroups([name,repo]));
});
