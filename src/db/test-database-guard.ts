function parseDatabaseUrl(
  value: string | undefined,
  variableName: string,
): URL {
  if (!value) {
    throw new Error(`${variableName} is required to run integration tests.`);
  }

  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname ||
    !url.pathname.slice(1)
  ) {
    throw new Error(`${variableName} must be a PostgreSQL connection URL.`);
  }
  return url;
}

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

export function assertIsolatedTestDatabase(
  testDatabaseUrl: string | undefined,
  applicationDatabaseUrl: string | undefined,
): URL {
  const test = parseDatabaseUrl(testDatabaseUrl, "TEST_DATABASE_URL");
  const application = parseDatabaseUrl(applicationDatabaseUrl, "DATABASE_URL");
  const testDatabase = databaseName(test);

  if (!/^[a-zA-Z0-9_]+$/.test(testDatabase) || testDatabase.length > 63) {
    throw new Error("The integration database name is not safe.");
  }
  if (!testDatabase.endsWith("_test")) {
    throw new Error("The integration database name must end in _test.");
  }

  if (testDatabase === databaseName(application)) {
    throw new Error("TEST_DATABASE_URL must identify a separate database.");
  }

  return test;
}
