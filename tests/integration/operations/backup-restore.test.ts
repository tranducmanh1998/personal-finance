import "dotenv/config";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import pg from "pg";
import { assertIsolatedTestDatabase } from "@/db/test-database-guard";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
let temporaryDirectory: string | undefined;
let maintenancePool: pg.Pool | undefined;
const createdDatabases = new Set<string>();

function uniqueTestDatabaseNames(): Readonly<{
  source: string;
  restored: string;
}> {
  const suffix = randomUUID().replaceAll("-", "");
  return {
    source: `finance_backup_${suffix}_test`,
    restored: `finance_restore_${suffix}_test`,
  };
}

function connectionEnvironment(url: URL): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
  };
  const sslMode = url.searchParams.get("sslmode");
  if (sslMode) environment.PGSSLMODE = sslMode;
  return environment;
}

function runPostgresTool(
  command: "pg_dump" | "pg_restore",
  args: readonly string[],
  environment: NodeJS.ProcessEnv,
  input?: Buffer,
): Buffer {
  const toolsContainer = process.env.POSTGRES_TOOLS_CONTAINER;
  const executable = toolsContainer ? "docker" : command;
  const toolArgs = toolsContainer
    ? [
        "exec",
        "-i",
        "--env",
        "PGHOST",
        "--env",
        "PGPORT",
        "--env",
        "PGUSER",
        "--env",
        "PGPASSWORD",
        ...(environment.PGSSLMODE ? ["--env", "PGSSLMODE"] : []),
        toolsContainer,
        command,
        ...args,
      ]
    : args;
  const result = spawnSync(executable, toolArgs, {
    env: environment,
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(
      `${executable} could not run. Install PostgreSQL client tools or set POSTGRES_TOOLS_CONTAINER to a PostgreSQL tools container.`,
      { cause: result.error },
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} failed with exit code ${result.status}: ${result.stderr.toString().trim()}`,
    );
  }
  return result.stdout;
}

describe("disposable PostgreSQL backup and restore", () => {
  afterEach(async () => {
    if (maintenancePool) {
      for (const databaseName of createdDatabases) {
        await maintenancePool.query(
          "select pg_terminate_backend(pid) from pg_stat_activity where datname = $1 and pid <> pg_backend_pid()",
          [databaseName],
        );
        await maintenancePool.query(`drop database "${databaseName}"`);
      }
      createdDatabases.clear();
      await maintenancePool.end();
      maintenancePool = undefined;
    }
    if (temporaryDirectory) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      temporaryDirectory = undefined;
    }
  });

  it("restores synthetic records from a custom-format dump into a second disposable database", async () => {
    const testUrl = assertIsolatedTestDatabase(
      testDatabaseUrl,
      applicationDatabaseUrl,
    );
    const names = uniqueTestDatabaseNames();
    if (
      !/^[a-zA-Z0-9_]+$/.test(names.source) ||
      !/^[a-zA-Z0-9_]+$/.test(names.restored)
    ) {
      throw new Error("Generated disposable database name is unsafe.");
    }

    const maintenanceUrl = new URL(testUrl);
    maintenanceUrl.pathname = "/postgres";
    maintenancePool = new pg.Pool({
      connectionString: maintenanceUrl.toString(),
    });

    for (const databaseName of [names.source, names.restored]) {
      const existing = await maintenancePool.query(
        "select 1 from pg_database where datname = $1",
        [databaseName],
      );
      if (existing.rowCount !== 0) {
        throw new Error(
          `Refusing to overwrite pre-existing disposable database "${databaseName}".`,
        );
      }
      await maintenancePool.query(`create database "${databaseName}"`);
      createdDatabases.add(databaseName);
    }

    const sourceUrl = new URL(testUrl);
    sourceUrl.pathname = `/${names.source}`;
    const sourcePool = new pg.Pool({
      connectionString: sourceUrl.toString(),
    });
    try {
      await sourcePool.query(
        "create table synthetic_backup_probe (id text primary key, amount bigint not null, note text not null)",
      );
      await sourcePool.query(
        "insert into synthetic_backup_probe (id, amount, note) values ($1, $2, $3)",
        ["synthetic-row-1", "9007199254740993", "fake backup data"],
      );
    } finally {
      await sourcePool.end();
    }

    temporaryDirectory = await mkdtemp(
      join(tmpdir(), "personal-finance-backup-test-"),
    );
    const dumpPath = join(temporaryDirectory, "synthetic.dump");
    const toolEnvironment = connectionEnvironment(testUrl);
    const dump = runPostgresTool(
      "pg_dump",
      [
        "--format=custom",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        names.source,
      ],
      toolEnvironment,
    );
    await writeFile(dumpPath, dump);
    expect((await stat(dumpPath)).size).toBeGreaterThan(0);
    expect(dump).not.toHaveLength(0);

    runPostgresTool(
      "pg_restore",
      [
        "--exit-on-error",
        "--no-owner",
        "--no-privileges",
        "--dbname",
        names.restored,
      ],
      toolEnvironment,
      await readFile(dumpPath),
    );

    const restoredUrl = new URL(testUrl);
    restoredUrl.pathname = `/${names.restored}`;
    const restoredPool = new pg.Pool({
      connectionString: restoredUrl.toString(),
    });
    try {
      const { rows } = await restoredPool.query(
        "select id, amount::text, note from synthetic_backup_probe",
      );
      expect(rows).toEqual([
        {
          id: "synthetic-row-1",
          amount: "9007199254740993",
          note: "fake backup data",
        },
      ]);
    } finally {
      await restoredPool.end();
    }
  }, 60_000);
});
