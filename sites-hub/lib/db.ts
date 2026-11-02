import { env } from "cloudflare:workers";
import { resilientDatabase } from './storage-health.mjs';

export function db(): D1Database {
  if (!env.DB) throw new Error("Binding D1 DB absent.");
  return resilientDatabase(env.DB) as D1Database;
}
