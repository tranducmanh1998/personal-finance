import "dotenv/config";
import { spawnSync } from "node:child_process";
import { assertIsolatedTestDatabase } from "../src/db/test-database-guard";

const sourceUrl = process.env.DATABASE_URL;
const testUrlValue = process.env.TEST_DATABASE_URL;
const testUrl = assertIsolatedTestDatabase(testUrlValue, sourceUrl);
const testDatabase = decodeURIComponent(testUrl.pathname.slice(1));

const connectionUrl = new URL(testUrl);
connectionUrl.pathname = "/postgres";
const { default: pg } = await import("pg");
const pool = new pg.Pool({ connectionString: connectionUrl.toString() });

try {
  const existing = await pool.query(
    "select 1 from pg_database where datname = $1",
    [testDatabase],
  );
  if (existing.rowCount === 0) {
    await pool.query(`CREATE DATABASE "${testDatabase}"`);
  }
} finally {
  await pool.end();
}

console.info(
  `Using isolated PostgreSQL integration database "${testDatabase}".`,
);
const vitestPath = new URL(
  "../node_modules/vitest/vitest.mjs",
  import.meta.url,
);
const result = spawnSync(
  process.execPath,
  [vitestPath.pathname, "run", "--config", "vitest.integration.config.ts"],
  {
    cwd: process.cwd(),
    env: { ...process.env, TEST_DATABASE_URL: testUrl.toString() },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
