import "dotenv/config";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

const globalForDatabase = globalThis as typeof globalThis & {
  personalFinancePool?: Pool;
  personalFinanceDb?: Database;
};

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is required to access the database.");
  }
  return url;
}

export function getPool(): Pool {
  globalForDatabase.personalFinancePool ??= new Pool({
    connectionString: databaseUrl(),
  });
  return globalForDatabase.personalFinancePool;
}

export function getDb(): Database {
  globalForDatabase.personalFinanceDb ??= drizzle(getPool(), { schema });
  return globalForDatabase.personalFinanceDb;
}

export async function closeDb(): Promise<void> {
  const pool = globalForDatabase.personalFinancePool;
  if (pool) {
    await pool.end();
    delete globalForDatabase.personalFinancePool;
    delete globalForDatabase.personalFinanceDb;
  }
}
