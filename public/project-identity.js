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
