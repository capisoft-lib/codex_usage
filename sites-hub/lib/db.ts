import { env } from "cloudflare:workers";

export function db(): D1Database {
  if (!env.DB) throw new Error("Binding D1 DB absent.");
  return env.DB;
}
