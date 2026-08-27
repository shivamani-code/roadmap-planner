import fs from "node:fs";
import path from "node:path";
import type { PGlite } from "@electric-sql/pglite";

const migrationsDirectory = path.resolve(
  import.meta.dirname,
  "../prisma/migrations",
);

export function readMigrations(): readonly { name: string; sql: string }[] {
  return fs
    .readdirSync(migrationsDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => ({
      name: entry.name,
      sql: fs.readFileSync(
        path.join(migrationsDirectory, entry.name, "migration.sql"),
        "utf8",
      ),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export async function applyEmbeddedMigrations(database: PGlite): Promise<void> {
  await database.exec(`
    CREATE TABLE IF NOT EXISTS public._studentos_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const applied = await database.query<{ name: string }>(
    "SELECT name FROM public._studentos_migrations",
  );
  const appliedNames = new Set(applied.rows.map((row) => row.name));
  for (const migration of readMigrations()) {
    if (appliedNames.has(migration.name)) continue;
    await database.exec("BEGIN");
    try {
      await database.exec(migration.sql);
      await database.query(
        "INSERT INTO public._studentos_migrations (name) VALUES ($1)",
        [migration.name],
      );
      await database.exec("COMMIT");
    } catch (error) {
      await database.exec("ROLLBACK");
      throw error;
    }
  }
}
