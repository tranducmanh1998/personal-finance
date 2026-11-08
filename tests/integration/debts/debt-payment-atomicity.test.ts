import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { debtPayment } from "@/db/schema/debt-payments";
import { debt } from "@/db/schema/debts";
import { transaction } from "@/db/schema/finance";
import { user } from "@/db/schema/auth";
import { getDashboardSummary } from "@/features/dashboard/dashboard.repository";
import {
  createDebt,
  getDebt,
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

function assertIsolatedDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required for isolated payment integration tests.",
    );
  }
  const test = new URL(testDatabaseUrl);
  const application = new URL(applicationDatabaseUrl);
  const testName = decodeURIComponent(test.pathname.slice(1));
  if (!testName.endsWith("_test")) {
    throw new Error("TEST_DATABASE_URL must end in a dedicated _test database.");
  }
  if (
    test.hostname.toLowerCase() === application.hostname.toLowerCase() &&
    (test.port || "5432") === (application.port || "5432") &&
    testName === decodeURIComponent(application.pathname.slice(1))
  ) {
    throw new Error(
      "Refusing to run debt payment tests against the application database.",
    );
  }
}

function fakeDebtInput(
  borrowerName: string,
  balanceAmount = "1000",
) {
  return {
    borrowerName,
    loanType: "Vay kiểm thử",
    balanceAsOf: "2026-11-01",
    balanceAmount,
    dueDate: "2026-11-05",
    principalDuePerPeriod: "200",
    interestDuePerPeriod: "50",
    paymentDuePerPeriod: "250",
    finalPeriod: "2027-11-05",
  };
}

describe("debt payment PostgreSQL atomicity", () => {
  beforeAll(async () => {
    assertIsolatedDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION test_fail_debt_payment_insert()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM "transaction"
          WHERE id = NEW.transaction_id
            AND description LIKE 'Thanh toán nợ Payment insert rollback%'
        ) THEN
          RAISE EXCEPTION 'injected payment insert failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER test_fail_debt_payment_insert
      BEFORE INSERT ON debt_payment
      FOR EACH ROW EXECUTE FUNCTION test_fail_debt_payment_insert()
    `));
    await db.execute(sql.raw(`
      CREATE OR REPLACE FUNCTION test_fail_debt_balance_update()
      RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW.borrower_name = 'Debt update rollback' THEN
          RAISE EXCEPTION 'injected debt update failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `));
    await db.execute(sql.raw(`
      CREATE TRIGGER test_fail_debt_balance_update
      BEFORE UPDATE ON debt
      FOR EACH ROW EXECUTE FUNCTION test_fail_debt_balance_update()
    `));

    ownerId = `fake-debt-payment-${randomUUID()}`;
    otherOwnerId = `fake-debt-payment-other-${randomUUID()}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Payment Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Payment Other Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (db) {
      try {
        if (ownerId) {
          await db
            .delete(debtPayment)
            .where(eq(debtPayment.userId, ownerId));
          await db
            .delete(transaction)
            .where(eq(transaction.userId, ownerId));
          await db.delete(debt).where(eq(debt.userId, ownerId));
          await db.delete(category).where(eq(category.userId, ownerId));
          await db.delete(user).where(eq(user.id, ownerId));
        }
        if (otherOwnerId) {
          await db.delete(user).where(eq(user.id, otherOwnerId));
        }
      } finally {
        await db.execute(
          sql.raw(
            "DROP TRIGGER IF EXISTS test_fail_debt_payment_insert ON debt_payment",
          ),
        );
        await db.execute(
          sql.raw(
            "DROP TRIGGER IF EXISTS test_fail_debt_balance_update ON debt",
          ),
        );
        await db.execute(
          sql.raw("DROP FUNCTION IF EXISTS test_fail_debt_payment_insert()"),
        );
        await db.execute(
          sql.raw("DROP FUNCTION IF EXISTS test_fail_debt_balance_update()"),
        );
        await closeDb();
      }
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("links exact principal and interest, reduces only principal, and updates dashboard", async () => {
    const ownedDebt = await createDebt(
      ownerId,
      fakeDebtInput("Successful payment"),
    );
    const beforeSummary = await getDashboardSummary(ownerId, "2026-11", db);
    const payment = await recordDebtPayment(ownerId, ownedDebt.id, {
      period: "2026-11",
      paidOn: "2026-11-05",
      principalAmount: "200",
      interestAmount: "50",
    });

    expect(payment.principalAmount).toBe("200");
    expect(payment.interestAmount).toBe("50");
    expect(payment.totalAmount).toBe("250");
    expect((await getDebt(ownerId, ownedDebt.id))?.balanceAmount).toBe("800");
    expect(await listDebtPayments(ownerId, ownedDebt.id)).toEqual([payment]);

    const [linkedTransaction] = await db
      .select()
      .from(transaction)
      .where(eq(transaction.id, payment.transactionId));
    expect(linkedTransaction.amount).toBe(250n);
    expect(linkedTransaction.occurredOn).toBe("2026-11-05");

    const summary = await getDashboardSummary(ownerId, "2026-11", db);
    expect(BigInt(summary.currentMonth.expenses)).toBe(
      BigInt(beforeSummary.currentMonth.expenses) + 50n,
    );
    expect(BigInt(summary.netWorth)).toBe(BigInt(beforeSummary.netWorth) + 200n);
  });

  it("rejects duplicate periods, overpayment, and access from another user", async () => {
    const ownedDebt = await createDebt(
      ownerId,
      fakeDebtInput("Duplicate and ownership"),
    );
    await recordDebtPayment(ownerId, ownedDebt.id, {
      period: "2026-11",
      paidOn: "2026-11-05",
      principalAmount: "100",
      interestAmount: "10",
    });

    await expect(
      recordDebtPayment(ownerId, ownedDebt.id, {
        period: "2026-11",
        paidOn: "2026-11-06",
        principalAmount: "100",
        interestAmount: "10",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      recordDebtPayment(ownerId, ownedDebt.id, {
        period: "2026-12",
        paidOn: "2026-12-05",
        principalAmount: "901",
        interestAmount: "0",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      recordDebtPayment(otherOwnerId, ownedDebt.id, {
        period: "2026-12",
        paidOn: "2026-12-05",
        principalAmount: "100",
        interestAmount: "10",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await getDebt(ownerId, ownedDebt.id))?.balanceAmount).toBe("900");
    expect(await listDebtPayments(ownerId, ownedDebt.id)).toHaveLength(1);
  });

  it("rolls back the linked transaction when payment insertion fails", async () => {
    const ownedDebt = await createDebt(
      ownerId,
      fakeDebtInput("Payment insert rollback"),
    );
    const transactionCount = await db
      .select()
      .from(transaction)
      .where(eq(transaction.userId, ownerId));
    const paymentCount = await db
      .select()
      .from(debtPayment)
      .where(eq(debtPayment.userId, ownerId));

    await expect(
      recordDebtPayment(ownerId, ownedDebt.id, {
        period: "2026-11",
        paidOn: "2026-11-05",
        principalAmount: "200",
        interestAmount: "50",
      }),
    ).rejects.toThrow();

    expect(
      await db.select().from(transaction).where(eq(transaction.userId, ownerId)),
    ).toHaveLength(transactionCount.length);
    expect(
      await db
        .select()
        .from(debtPayment)
        .where(eq(debtPayment.userId, ownerId)),
    ).toHaveLength(paymentCount.length);
    expect((await getDebt(ownerId, ownedDebt.id))?.balanceAmount).toBe("1000");
  });

  it("rolls back payment and linked transaction when debt update fails", async () => {
    const ownedDebt = await createDebt(
      ownerId,
      fakeDebtInput("Debt update rollback"),
    );
    const transactionCount = await db
      .select()
      .from(transaction)
      .where(eq(transaction.userId, ownerId));
    const paymentCount = await db
      .select()
      .from(debtPayment)
      .where(eq(debtPayment.userId, ownerId));

    await expect(
      recordDebtPayment(ownerId, ownedDebt.id, {
        period: "2026-11",
        paidOn: "2026-11-05",
        principalAmount: "200",
        interestAmount: "50",
      }),
    ).rejects.toThrow();

    expect(
      await db.select().from(transaction).where(eq(transaction.userId, ownerId)),
    ).toHaveLength(transactionCount.length);
    expect(
      await db
        .select()
        .from(debtPayment)
        .where(eq(debtPayment.userId, ownerId)),
    ).toHaveLength(paymentCount.length);
    expect((await getDebt(ownerId, ownedDebt.id))?.balanceAmount).toBe("1000");
  });
});
