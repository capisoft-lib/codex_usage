import { DatabaseSync } from "node:sqlite";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function sqlitePath(legacyPath) {
  if (!legacyPath) return ":memory:";
  return /\.(sqlite|db)$/i.test(legacyPath)
    ? legacyPath
    : `${legacyPath}.sqlite`;
}

// The same committed Drizzle migrations are executed by Sites and local SQLite.
// No npm/native addon or separate database service is required.
export function openSqlite(filename = ":memory:") {
  if (filename !== ":memory:")
    mkdirSync(path.dirname(path.resolve(filename)), { recursive: true });
  const raw = new DatabaseSync(filename);
  try {
    raw.exec(
      "PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;",
    );
    raw.exec(
      "CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY NOT NULL)",
    );
    const directory = new URL("../../sites-hub/drizzle/", import.meta.url);
    // Resolve from repository root; also preserved in the Docker runtime layout.
    for (const name of readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (raw.prepare("SELECT 1 FROM local_migrations WHERE name=?").get(name))
        continue;
      transaction(raw, () => {
        if (
          raw.prepare("SELECT 1 FROM local_migrations WHERE name=?").get(name)
        )
          return;
        raw.exec(readFileSync(new URL(name, directory), "utf8"));
        raw.prepare("INSERT INTO local_migrations VALUES (?)").run(name);
      });
    }
    raw.exec(
      "CREATE TABLE IF NOT EXISTS local_metadata (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL)",
    );
    return { raw, ...d1Adapter(raw), close: () => raw.close() };
  } catch (error) {
    raw.close();
    throw error;
  }
}

export function transaction(raw, work) {
  raw.exec("BEGIN IMMEDIATE");
  try {
    const result = work();
    raw.exec("COMMIT");
    return result;
  } catch (error) {
    raw.exec("ROLLBACK");
    throw error;
  }
}

// D1-compatible read interface. Transactions remain explicit on the native side.
export function d1Adapter(raw) {
  return {
    prepare(sql) {
      const statement = raw.prepare(sql);
      const bound = (values) => ({
        bind: (...args) => bound(args),
        all: async () => ({ results: statement.all(...values) }),
        first: async () => statement.get(...values) ?? null,
        run: async () => ({ meta: statement.run(...values) }),
      });
      return bound([]);
    },
  };
}
