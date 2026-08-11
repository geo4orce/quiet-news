import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import pg from "pg";

const { Pool } = pg;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export async function runMigrationJob({
  databaseUrl = requiredEnvironment("DATABASE_URL"),
  PoolClass = Pool,
  migrationUrl = new URL("../database/migrations/001_initial.sql", import.meta.url),
  log = console
} = {}) {
  const pool = new PoolClass({
    connectionString: databaseUrl,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 3_000
  });

  try {
    const sql = await readFile(migrationUrl, "utf8");
    await pool.query(sql);
    log.info(JSON.stringify({ event: "database_migration_finished" }));
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    await runMigrationJob();
  } catch {
    console.error(JSON.stringify({
      event: "database_migration_failed",
      error_code: "migration_error"
    }));
    process.exitCode = 1;
  }
}
