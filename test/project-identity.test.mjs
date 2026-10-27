import assert from "node:assert/strict";
import test from "node:test";
import { OVERVIEW_PROJECT_LIMIT, NO_PROJECT_KEY, projectIdentity, normalizeProjectGroups, automaticProjectGroups, collapseProjectCatalog } from "../public/project-identity.js";

test("groups projects by GitHub URL before the local project name", () => {
  const left = projectIdentity({ id: "one", projectName: "Desktop", projectGitHubUrl: "https://github.com/example/shared" });
  const right = projectIdentity({ id: "two", projectName: "Container", projectGitHubUrl: "https://github.com/example/shared" });
  assert.equal(left.key, right.key);
  assert.equal(left.name, "Desktop");
});

test("falls back to a normalized project name", () => {
  assert.equal(projectIdentity({ id: "one", projectName: "SewKeep" }).key, projectIdentity({ id: "two", projectName: "sewkeep" }).key);
});

test("groups unnamed sessions across machines under one localized identity without displaying privacy hashes", () => {
  for (const session of [{}, { id: "one", nodeId: "pc", cwd: null }, { id: "two", nodeId: "other", cwd: "project-123456789abc" }, { projectName: "  " }]) {
    assert.deepEqual(projectIdentity(session, "Sans projet"), { key: NO_PROJECT_KEY, name: "Sans projet", githubUrl: null });
  }
  assert.equal(projectIdentity({}, "No project").key, NO_PROJECT_KEY);
  assert.notEqual(projectIdentity({projectName:"Sans projet"}).key, NO_PROJECT_KEY);
  assert.equal(projectIdentity({cwd:"C:\\work\\Example"}).name, "Example");
});

test("supports no-project custom groups and preserves existing per-session memberships", () => {
  const groups = normalizeProjectGroups([{id:"combined",name:"Combined",members:[NO_PROJECT_KEY,"name:example"]}]);
  assert.equal(projectIdentity({}, "Sans projet", groups).key, "group:combined");
  const legacy = [{id:"legacy",name:"Legacy",members:["session:pc:source","name:example"]}];
  assert.equal(projectIdentity({id:"prefixed",sourceSessionId:"source",nodeId:"pc"}, "Sans projet", legacy).key, "group:legacy");
  assert.equal(projectIdentity({id:"another",nodeId:"pc"}, "Sans projet", legacy).key, NO_PROJECT_KEY);
  assert.throws(() => normalizeProjectGroups([{...groups[0],members:["no-project:invalid","name:example"]}]));
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
