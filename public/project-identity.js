export const OVERVIEW_PROJECT_LIMIT = 5;

function visibleProjectName(session) {
  const explicit = String(session?.projectName || "").trim();
  if (explicit) return explicit;

  const githubParts = String(session?.projectGitHubUrl || "").replace(/\/+$/, "").split("/").filter(Boolean);
  if (githubParts.length) return githubParts.at(-1);

  const cwdParts = String(session?.cwd || "").replace(/\\/g, "/").replace(/\/+$/, "").split("/").filter(Boolean);
  const cwdName = cwdParts.at(-1) || "";
  return /^project-[a-f0-9]{12}$/i.test(cwdName) ? null : cwdName || null;
}

function normalizedName(value) {
  return String(value).normalize("NFKC").trim().toLocaleLowerCase("en");
}

function originalProjectIdentity(session, unknownLabel = "No project") {
  const githubUrl = String(session?.projectGitHubUrl || "").trim() || null;
  const name = visibleProjectName(session);
  if (githubUrl) return { key: `github:${githubUrl.toLowerCase()}`, name: name || unknownLabel, githubUrl };
  if (name) return { key: `name:${normalizedName(name)}`, name, githubUrl: null };
  const uniqueSessionId = session?.sourceSessionId || session?.id || crypto.randomUUID();
  return { key: `session:${session?.nodeId || "local"}:${uniqueSessionId}`, name: unknownLabel, githubUrl: null };
}

export function normalizeProjectGroups(value) {
  if (!Array.isArray(value)) throw new Error('Invalid project groups');
  const ids = new Set(), members = new Set();
  return value.map(group => {
    if (!group || typeof group.id !== 'string' || !group.id || ids.has(group.id)
      || typeof group.name !== 'string' || !group.name.trim() || group.name.length > 120
      || !Array.isArray(group.members) || group.members.length < 2) throw new Error('Invalid project group');
    ids.add(group.id);
    for (const key of group.members) {
      if (typeof key !== 'string' || !/^(github|name|session):/.test(key) || members.has(key)) throw new Error('Invalid project member');
      members.add(key);
    }
    return { id: group.id, name: group.name.trim(), members: [...group.members] };
  });
}

export function projectIdentity(session, unknownLabel = 'No project', groups = []) {
  const original = originalProjectIdentity(session, unknownLabel);
  const group = groups.find(group => group.members.includes(original.key));
  return group ? { key: `group:${group.id}`, name: group.name, githubUrl: null } : original;
}


// Only join a name-only identity to one unambiguous repository. Explicit
// memberships take priority and repositories are never merged with each other.
export function automaticProjectGroups(catalog, manualGroups = []) {
  const repositories = new Map();
  const reserved = new Set(manualGroups.flatMap(g => g.members));
  for (const project of catalog) {
    if (!project.key.startsWith('github:')) continue;
    const name = normalizedName(project.name);
    if (!repositories.has(name)) repositories.set(name, new Map());
    repositories.get(name).set(project.key, project);
  }
  const result = [];
  for (const project of catalog) {
    if (!project.key.startsWith('name:') || reserved.has(project.key)) continue;
    const candidates = repositories.get(normalizedName(project.name));
    if (candidates?.size !== 1) continue;
    const repository = [...candidates.values()][0];
    if (reserved.has(repository.key)) continue;
    result.push({id:`automatic:${repository.key}`, name:repository.name, members:[project.key,repository.key]});
  }
  return result.sort((a,b)=>a.id.localeCompare(b.id));
}

export function collapseProjectCatalog(catalog, automaticGroups) {
  const aliases = new Map(automaticGroups.flatMap(g => g.members.map(key => [key,g])));
  const result = new Map();
  for (const project of catalog) {
    const group = aliases.get(project.key);
    const key = group ? group.members.find(member=>member.startsWith('github:')) : project.key;
    if (!result.has(key)) result.set(key, {...project, key, name:group?.name || project.name, members:group?.members || [project.key]});
  }
  return [...result.values()];
}
