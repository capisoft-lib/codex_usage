import { randomBytes } from "node:crypto";
import { toPublicUsage } from "./public-usage.mjs";
import { canonicalJson, sha256 } from "./mesh-protocol.mjs";

function basename(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").split("/").pop() || null;
}

function projectValue(cwd, mode, salt) {
  if (!cwd) return null;
  if (mode === "full") return cwd;
  if (mode === "basename") return basename(cwd);
  return `project-${sha256(`${salt}:${cwd}`).slice(0, 12)}`;
}

export function createPrivacySalt() {
  return randomBytes(32).toString("base64url");
}

export function sanitizeUsageForMesh(data, options = {}) {
  const projectMode = ["hash", "basename", "full"].includes(options.projectMode) ? options.projectMode : "hash";
  const includeTitles = options.includeTitles === true;
  const projectSalt = options.projectSalt || createPrivacySalt();
  const publicData = toPublicUsage(data);
  const sessions = publicData.sessions.map((session) => ({
    ...session,
    title: includeTitles ? session.title : `Conversation ${sha256(session.id).slice(0, 8)}`,
    cwd: projectValue(session.cwd, projectMode, projectSalt),
  }));
  return {
    analyzerVersion: publicData.analyzerVersion,
    generatedAt: publicData.generatedAt,
    quota: publicData.weeklyQuota,
    privacy: { projectMode, includeTitles },
    sessions,
  };
}

export function sessionHashes(sessions) {
  return Object.fromEntries((sessions || []).map((session) => [session.id, sha256(canonicalJson(session))]));
}
