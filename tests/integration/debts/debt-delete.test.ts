import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb, getDb, type Database } from "@/db";
import { user } from "@/db/schema/auth";
import { debtPayment } from "@/db/schema/debt-payments";
import { debt } from "@/db/schema/debts";
import { transaction } from "@/db/schema/finance";
import { getDashboardSummary } from "@/features/dashboard/dashboard.repository";
import {
  createDebt,
  deleteDebt,
  getDebt,
  listDebts,
} from "@/features/debts/debt.service";
import {
  listDebtPayments,
  recordDebtPayment,
} from "@/features/debts/payment.service";

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

function debtInput(balanceAmount: string) {
  return {
    borrowerName: "Khoản nợ giả lập",
    loanType: "Vay kiểm thử",
    balanceAsOf: "2026-11-01",
    balanceAmount,
    dueDate: "2026-11-05",
    principalDuePerPeriod: "1000",
    interestDuePerPeriod: "50",
    paymentDuePerPeriod: "1050",
    finalPeriod: "2027-11-05",
  };
}

describe("settled debt deletion PostgreSQL integration", () => {
  beforeAll(async () => {
    ensureIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    ownerId = `fake-debt-delete-owner-${randomUUID()}`;
    otherOwnerId = `fake-debt-delete-other-${randomUUID()}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Debt Delete Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Debt Delete Other Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (db && ownerId && otherOwnerId) {
      await db
        .delete(debtPayment)
        .where(
          or(
            eq(debtPayment.userId, ownerId),
            eq(debtPayment.userId, otherOwnerId),
          ),
        );
      await db
        .delete(transaction)
        .where(
          or(
            eq(transaction.userId, ownerId),
            eq(transaction.userId, otherOwnerId),
          ),
        );
      await db
        .delete(debt)
        .where(or(eq(debt.userId, ownerId), eq(debt.userId, otherOwnerId)));
      await db
        .delete(user)
        .where(or(eq(user.id, ownerId), eq(user.id, otherOwnerId)));
      await closeDb();
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("blocks unpaid deletion, then archives a settled debt without losing payment history", async () => {
    const created = await createDebt(ownerId, debtInput("1000"));

    await expect(deleteDebt(ownerId, created.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    expect((await listDebts(ownerId)).map((item) => item.id)).toContain(
      created.id,
    );

    const payment = await recordDebtPayment(ownerId, created.id, {
      period: "2026-11",
      paidOn: "2026-11-06",
      principalAmount: "1000",
      interestAmount: "50",
    });
    const dashboardBeforeArchive = await getDashboardSummary(
      ownerId,
      "2026-11",
      db,
    );

    await deleteDebt(ownerId, created.id);

    expect((await listDebts(ownerId)).map((item) => item.id)).not.toContain(
      created.id,
    );
    expect(await getDebt(ownerId, created.id)).toMatchObject({
      id: created.id,
      balanceAmount: "0",
    });
    expect(await listDebtPayments(ownerId, created.id)).toMatchObject([
      expect.objectContaining({
        id: payment.id,
        transactionId: payment.transactionId,
        principalAmount: "1000",
        interestAmount: "50",
      }),
    ]);

    const [linkedTransaction] = await db
      .select()
      .from(transaction)
      .where(eq(transaction.id, payment.transactionId));
    expect(linkedTransaction).toMatchObject({
      id: payment.transactionId,
      userId: ownerId,
      amount: 1050n,
      occurredOn: "2026-11-06",
    });

    const dashboardAfterArchive = await getDashboardSummary(
      ownerId,
      "2026-11",
      db,
    );
    expect(dashboardAfterArchive.netWorth).toBe(
      dashboardBeforeArchive.netWorth,
    );
    expect(dashboardAfterArchive.currentMonth.expenses).toBe(
      dashboardBeforeArchive.currentMonth.expenses,
    );
  });

  it("does not allow another user to archive a settled debt", async () => {
    const otherUsersDebt = await createDebt(otherOwnerId, debtInput("0"));

    await expect(deleteDebt(ownerId, otherUsersDebt.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect((await listDebts(otherOwnerId)).map((item) => item.id)).toContain(
      otherUsersDebt.id,
    );
  });
});
