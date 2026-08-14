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

export function projectIdentity(session, unknownLabel = "No project") {
  const githubUrl = String(session?.projectGitHubUrl || "").trim() || null;
  const name = visibleProjectName(session);
  if (githubUrl) return { key: `github:${githubUrl.toLowerCase()}`, name: name || unknownLabel, githubUrl };
  if (name) return { key: `name:${normalizedName(name)}`, name, githubUrl: null };
  const uniqueSessionId = session?.sourceSessionId || session?.id || crypto.randomUUID();
  return { key: `session:${session?.nodeId || "local"}:${uniqueSessionId}`, name: unknownLabel, githubUrl: null };
}
