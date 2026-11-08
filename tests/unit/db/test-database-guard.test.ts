import { describe, expect, it } from "vitest";
import { assertIsolatedTestDatabase } from "@/db/test-database-guard";

const applicationDatabaseUrl =
  "postgres://finance@localhost:5432/personal_finance";

describe("integration database guard", () => {
  it("accepts a separate database with the required suffix", () => {
    const url = assertIsolatedTestDatabase(
      "postgres://finance@localhost:5432/personal_finance_test",
      applicationDatabaseUrl,
    );

    expect(url.pathname).toBe("/personal_finance_test");
  });

  it("fails when either database URL is missing", () => {
    expect(() =>
      assertIsolatedTestDatabase(undefined, applicationDatabaseUrl),
    ).toThrow("TEST_DATABASE_URL is required");
    expect(() =>
      assertIsolatedTestDatabase(
        "postgres://finance@localhost:5432/personal_finance_test",
        undefined,
      ),
    ).toThrow("DATABASE_URL is required");
  });

  it("rejects a database without the test suffix", () => {
    expect(() =>
      assertIsolatedTestDatabase(
        "postgres://finance@localhost:5432/personal_finance",
        applicationDatabaseUrl,
      ),
    ).toThrow("must end in _test");
  });

  it("rejects the application database even when it has the test suffix", () => {
    const sameDatabaseUrl =
      "postgres://other-user@LOCALHOST/personal_finance_test";

    expect(() =>
      assertIsolatedTestDatabase(sameDatabaseUrl, sameDatabaseUrl),
    ).toThrow("must identify a separate database");
  });

  it("rejects the application database name even through another endpoint", () => {
    expect(() =>
      assertIsolatedTestDatabase(
        "postgres://finance@other-host:5433/personal_finance_test",
        "postgres://finance@localhost:5432/personal_finance_test",
      ),
    ).toThrow("must identify a separate database");
  });

  it("rejects unsafe database names", () => {
    expect(() =>
      assertIsolatedTestDatabase(
        "postgres://finance@localhost:5432/unsafe-name_test",
        applicationDatabaseUrl,
      ),
    ).toThrow("database name is not safe");
  });
});
