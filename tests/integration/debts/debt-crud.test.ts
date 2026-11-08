import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { user } from "@/db/schema/auth";
import {
  createDebt,
  deleteDebt,
  getDebt,
  listDebts,
  updateDebt,
} from "@/features/debts/debt.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
let db: Database;
let ownerId: string;
let otherOwnerId: string;
let originalDatabaseUrl: string | undefined;

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function ensureIsolatedTestDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required to verify database isolation.",
    );
  }

  const test = new URL(testDatabaseUrl);
  const application = new URL(applicationDatabaseUrl);
  if (!databaseName(test).endsWith("_test")) {
    throw new Error(
      "TEST_DATABASE_URL must identify a database ending in _test.",
    );
  }
  if (
    test.hostname.toLowerCase() === application.hostname.toLowerCase() &&
    (test.port || "5432") === (application.port || "5432") &&
    databaseName(test) === databaseName(application)
  ) {
    throw new Error(
      "Refusing to run debt integration tests against the application database.",
    );
  }
}

function debtInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    borrowerName: "Ngân hàng giả lập",
    loanType: "Vay giả lập",
    balanceAsOf: "2026-11-05",
    balanceAmount: "9007199254740993",
    dueDate: "2026-12-01",
    principalDuePerPeriod: "9007199254740993",
    interestDuePerPeriod: "123",
    paymentDuePerPeriod: "9007199254741116",
    finalPeriod: "2030-12-01",
    ...overrides,
  };
}

describe("debt PostgreSQL integration", () => {
  beforeAll(async () => {
    ensureIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    ownerId = `fake-debt-owner-${randomUUID()}`;
    otherOwnerId = `fake-debt-other-${randomUUID()}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Debt Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Other Debt Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (db && ownerId && otherOwnerId) {
      await db
        .delete(user)
        .where(or(eq(user.id, ownerId), eq(user.id, otherOwnerId)));
    }
    if (db) {
      await closeDb();
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("creates, reads, updates, totals dues, and enforces user-scoped access", async () => {
    const first = await createDebt(ownerId, debtInput());
    const second = await createDebt(
      ownerId,
      debtInput({
        borrowerName: "Người cho vay giả lập",
        balanceAmount: "2500",
        principalDuePerPeriod: "500",
        interestDuePerPeriod: "100",
        paymentDuePerPeriod: "600",
      }),
    );
    const otherUsersDebt = await createDebt(
      otherOwnerId,
      debtInput({
        borrowerName: "Riêng tư giả lập",
        balanceAmount: "999999",
        paymentDuePerPeriod: "99999",
      }),
    );

    const ownerDebts = await listDebts(ownerId);
    expect(ownerDebts).toHaveLength(2);
    expect(ownerDebts.map((item) => item.id)).toContain(first.id);
    expect(ownerDebts.map((item) => item.id)).toContain(second.id);
    expect(await getDebt(ownerId, first.id)).toMatchObject({
      id: first.id,
      borrowerName: "Ngân hàng giả lập",
      balanceAmount: "9007199254740993",
      paymentDuePerPeriod: "9007199254741116",
    });
    expect(await getDebt(otherOwnerId, first.id)).toBeNull();
    expect(first.paymentDuePerPeriod).toBe("9007199254741116");
    expect(second.paymentDuePerPeriod).toBe("600");
    expect(
      ownerDebts.reduce((sum, item) => sum + BigInt(item.balanceAmount), 0n),
    ).toBe(9_007_199_254_743_493n);
    expect(
      ownerDebts.reduce(
        (sum, item) => sum + BigInt(item.paymentDuePerPeriod),
        0n,
      ),
    ).toBe(9_007_199_254_741_716n);
    expect(await listDebts(otherOwnerId)).toEqual([otherUsersDebt]);

    const updated = await updateDebt(
      ownerId,
      second.id,
      debtInput({
        borrowerName: "Người cho vay đã sửa",
        balanceAmount: "2000",
        paymentDuePerPeriod: "550",
      }),
    );
    expect(updated.borrowerName).toBe("Người cho vay đã sửa");
    expect(updated.balanceAmount).toBe("2000");
    expect(updated.paymentDuePerPeriod).toBe("550");
    expect(
      (await listDebts(ownerId)).reduce(
        (sum, item) => sum + BigInt(item.balanceAmount),
        0n,
      ),
    ).toBe(9_007_199_254_742_993n);
    expect(
      (await listDebts(ownerId)).reduce(
        (sum, item) => sum + BigInt(item.paymentDuePerPeriod),
        0n,
      ),
    ).toBe(9_007_199_254_741_666n);

    await expect(
      updateDebt(otherOwnerId, first.id, debtInput()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteDebt(otherOwnerId, first.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listDebts(ownerId)).map((item) => item.id)).toContain(
      first.id,
    );
  });
});
