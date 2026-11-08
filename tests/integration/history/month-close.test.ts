import "dotenv/config";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { and, eq, or } from "drizzle-orm";
import { closeDb, getDb, type Database } from "@/db";
import { assetBalance } from "@/db/schema/assets";
import { user } from "@/db/schema/auth";
import { category } from "@/db/schema/categories";
import { debt } from "@/db/schema/debts";
import { debtPayment } from "@/db/schema/debt-payments";
import {
  historyBackfillState,
  monthlyHistorySnapshot,
} from "@/db/schema/history";
import { transaction } from "@/db/schema/finance";
import { deleteCategory } from "@/features/categories/category.service";
import {
  deleteDebt,
  updateDebt,
  createDebt,
} from "@/features/debts/debt.service";
import { recordDebtPayment } from "@/features/debts/payment.service";
import { saveAssetBalances } from "@/features/assets/asset.repository";
import {
  closeMissingMonthsThroughPreviousMonth,
  finalizeHistoricalBackfill,
  getMonthlyHistory,
  previewBackfillRange,
} from "@/features/history/history.service";
import { createMonthlySnapshot } from "@/features/history/history.repository";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/features/transactions/transaction.service";
import { previousMonth } from "@/features/dashboard/dashboard.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
let db: Database;
let originalDatabaseUrl: string | undefined;
let ownerId: string;
let otherOwnerId: string;
let backfillOwnerId: string;
let unconfirmedOwnerId: string;
let categoryId: string;
let incomeCategoryId: string;
let targetMonth: string;
let targetStart: string;
let targetEnd: string;
let currentMonth: string;
let currentStart: string;
let createdTransactionId: string;
let settledDebtId: string;
let anchoredDebtId: string;
const sourceCategoryName = "Lịch sử tách biệt";

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function assertIsolatedTestDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required for isolated history integration tests.",
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
      "Refusing to run history integration tests against the application database.",
    );
  }
}

function monthStart(month: string): string {
  return `${month}-01`;
}

function monthEnd(month: string): string {
  const end = new Date(`${month}-01T00:00:00.000Z`);
  end.setUTCMonth(end.getUTCMonth() + 1);
  end.setUTCDate(0);
  return end.toISOString().slice(0, 10);
}

function monthsBefore(month: string, count: number): string {
  let result = month;
  for (let index = 0; index < count; index += 1) result = previousMonth(result);
  return result;
}

function transactionInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    categoryId,
    kind: "expense",
    amount: "300",
    occurredOn: targetEnd,
    description: "Chi tiêu tháng chốt",
    ...overrides,
  };
}

function debtInput(name: string, balanceAsOf: string, balanceAmount: string) {
  return {
    borrowerName: name,
    loanType: "Vay kiểm thử lịch sử",
    balanceAsOf,
    balanceAmount,
    dueDate: targetEnd,
    principalDuePerPeriod: "100",
    interestDuePerPeriod: "20",
    paymentDuePerPeriod: "120",
    finalPeriod: null,
  };
}

describe("monthly history snapshots and backfill", () => {
  beforeAll(async () => {
    assertIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    const now = new Date();
    currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    targetMonth = previousMonth(currentMonth);
    targetStart = monthStart(targetMonth);
    targetEnd = monthEnd(targetMonth);
    currentStart = monthStart(currentMonth);
    ownerId = `fake-history-owner-${randomUUID()}`;
    otherOwnerId = `fake-history-other-${randomUUID()}`;
    backfillOwnerId = `fake-history-backfill-${randomUUID()}`;
    unconfirmedOwnerId = `fake-history-unconfirmed-${randomUUID()}`;

    const users = [ownerId, otherOwnerId, backfillOwnerId, unconfirmedOwnerId];
    await db.insert(user).values(
      users.map((id) => ({
        id,
        name: "Synthetic history test user",
        email: `${id}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      })),
    );

    const [incomeCategory, expenseCategory] = await db
      .insert(category)
      .values([
        { userId: ownerId, name: "Lương lịch sử", kind: "income" },
        { userId: ownerId, name: sourceCategoryName, kind: "expense" },
        { userId: otherOwnerId, name: "Riêng tư", kind: "income" },
      ])
      .returning();
    incomeCategoryId = incomeCategory.id;
    categoryId = expenseCategory.id;

    const [incomeForOther] = await db
      .select({ id: category.id })
      .from(category)
      .where(eq(category.userId, otherOwnerId))
      .limit(1);
    if (!incomeForOther) {
      throw new Error("Missing synthetic category for the other test user.");
    }

    const firstIncome = await createTransaction(ownerId, {
      categoryId: incomeCategoryId,
      kind: "income",
      amount: "5000",
      occurredOn: targetStart,
      description: "Thu đầu tháng",
    });
    const endExpense = await createTransaction(ownerId, transactionInput());
    createdTransactionId = endExpense.id;
    await createTransaction(ownerId, {
      categoryId: incomeCategoryId,
      kind: "income",
      amount: "9999",
      occurredOn: currentStart,
      description: "Thu đầu tháng kế tiếp",
    });
    await createTransaction(otherOwnerId, {
      categoryId: incomeForOther.id,
      kind: "income",
      amount: "8888",
      occurredOn: targetEnd,
      description: "Giao dịch user khác",
    });
    expect(firstIncome.occurredOn).toBe(targetStart);

    const anchoredDebt = await createDebt(
      ownerId,
      debtInput("Nợ còn dư", targetStart, "1000"),
    );
    anchoredDebtId = anchoredDebt.id;
    await recordDebtPayment(ownerId, anchoredDebt.id, {
      period: targetMonth,
      paidOn: targetEnd,
      principalAmount: "200",
      interestAmount: "50",
    });

    const settledDebt = await createDebt(
      ownerId,
      debtInput("Nợ đã tất toán", targetStart, "100"),
    );
    settledDebtId = settledDebt.id;
    await recordDebtPayment(ownerId, settledDebt.id, {
      period: targetMonth,
      paidOn: targetEnd,
      principalAmount: "100",
      interestAmount: "10",
    });
    await createDebt(ownerId, debtInput("Nợ thiếu mốc", currentStart, "500"));

    await saveAssetBalances(ownerId, targetEnd, [
      { kind: "cash", amount: 10_000n },
      { kind: "savings_deposit", amount: 20_000n },
      { kind: "cash_equivalent", amount: 30_000n },
    ]);
    await saveAssetBalances(ownerId, currentStart, [
      { kind: "cash", amount: 99_000n },
      { kind: "savings_deposit", amount: 0n },
      { kind: "cash_equivalent", amount: 0n },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (!db) return;
    try {
      const ids = [ownerId, otherOwnerId, backfillOwnerId, unconfirmedOwnerId];
      await db
        .delete(debtPayment)
        .where(or(...ids.map((id) => eq(debtPayment.userId, id))));
      await db
        .delete(transaction)
        .where(or(...ids.map((id) => eq(transaction.userId, id))));
      await db.delete(debt).where(or(...ids.map((id) => eq(debt.userId, id))));
      await db
        .delete(assetBalance)
        .where(or(...ids.map((id) => eq(assetBalance.userId, id))));
      await db
        .delete(category)
        .where(or(...ids.map((id) => eq(category.userId, id))));
      await db.delete(user).where(or(...ids.map((id) => eq(user.id, id))));
    } finally {
      await closeDb();
      if (originalDatabaseUrl) {
        process.env.DATABASE_URL = originalDatabaseUrl;
      }
    }
  });

  it("does not close periods before the owner explicitly completes backfill", async () => {
    await createTransaction(unconfirmedOwnerId, {
      categoryId: (
        await db
          .insert(category)
          .values({
            userId: unconfirmedOwnerId,
            name: "Thu",
            kind: "income",
          })
          .returning({ id: category.id })
      )[0].id,
      kind: "income",
      amount: "1",
      occurredOn: targetStart,
      description: "Chưa xác nhận",
    });
    await closeMissingMonthsThroughPreviousMonth(unconfirmedOwnerId);
    expect(
      await db
        .select()
        .from(monthlyHistorySnapshot)
        .where(eq(monthlyHistorySnapshot.userId, unconfirmedOwnerId)),
    ).toHaveLength(0);
    expect(
      await db
        .select()
        .from(historyBackfillState)
        .where(eq(historyBackfillState.userId, unconfirmedOwnerId)),
    ).toHaveLength(0);
  });

  it("closes a past month once with exact date boundaries and dated debt balances", async () => {
    await db.insert(historyBackfillState).values({
      userId: ownerId,
      startMonth: monthsBefore(targetMonth, 1),
      endMonth: monthsBefore(targetMonth, 1),
    });

    const snapshots = await Promise.all(
      Array.from({ length: 6 }, () =>
        createMonthlySnapshot(ownerId, targetMonth, "automatic"),
      ),
    );
    expect(new Set(snapshots.map((snapshot) => snapshot.id)).size).toBe(1);

    const history = await getMonthlyHistory(ownerId, targetMonth);
    expect(history.state).toBe("closed");
    expect(history.closedAt).toBeInstanceOf(Date);
    expect(history.transactions.map((record) => record.occurredOn)).toContain(
      targetStart,
    );
    expect(history.transactions.map((record) => record.occurredOn)).toContain(
      targetEnd,
    );
    expect(
      history.transactions.some((record) => record.occurredOn === currentStart),
    ).toBe(false);
    expect(
      history.transactions.some(
        (record) => record.description === "Giao dịch user khác",
      ),
    ).toBe(false);
    expect(
      history.transactions.find(
        (record) => record.sourceTransactionId === createdTransactionId,
      )?.categoryName,
    ).toBe(sourceCategoryName);
    expect(history.summary).toMatchObject({
      incomeTotal: "5000",
      expenseTotal: "360",
      knownDebtTotal: "800",
      unresolvedDebtCount: 1,
    });
    expect(
      history.debtBalances.find(
        (record) => record.sourceDebtId === anchoredDebtId,
      ),
    ).toMatchObject({
      closingBalance: "800",
      balanceStatus: "complete",
    });
    expect(
      history.debtBalances.find(
        (record) => record.borrowerName === "Nợ thiếu mốc",
      ),
    ).toMatchObject({
      closingBalance: null,
      balanceStatus: "insufficient_history",
    });
    expect(
      history.debtBalances.find(
        (record) => record.borrowerName === "Nợ đã tất toán",
      ),
    ).toMatchObject({ closingBalance: "0", balanceStatus: "complete" });
    expect(history.debtPayments).toHaveLength(2);
    expect(history.assets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "cash",
          amount: "10000",
          asOfDate: targetEnd,
        }),
      ]),
    );

    expect(
      await db
        .select()
        .from(monthlyHistorySnapshot)
        .where(
          and(
            eq(monthlyHistorySnapshot.userId, ownerId),
            eq(monthlyHistorySnapshot.month, targetMonth),
          ),
        ),
    ).toHaveLength(1);
    await expect(
      createMonthlySnapshot(ownerId, currentMonth, "automatic"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const nextMonth = `${new Date(`${currentMonth}-01T00:00:00.000Z`).getUTCFullYear()}-${String(
      new Date(`${currentMonth}-01T00:00:00.000Z`).getUTCMonth() + 2,
    ).padStart(2, "0")}`;
    await expect(
      createMonthlySnapshot(ownerId, nextMonth, "automatic"),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("blocks transaction, payment, debt, and asset changes in a closed period", async () => {
    await expect(
      createTransaction(
        ownerId,
        transactionInput({ description: "Tạo mới kỳ khóa" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateTransaction(
        ownerId,
        createdTransactionId,
        transactionInput({ amount: "700" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      deleteTransaction(ownerId, createdTransactionId),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await expect(
      recordDebtPayment(ownerId, anchoredDebtId, {
        period: monthsBefore(targetMonth, 2),
        paidOn: targetEnd,
        principalAmount: "10",
        interestAmount: "1",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateDebt(
        ownerId,
        anchoredDebtId,
        debtInput("Nợ sửa", currentStart, "800"),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      saveAssetBalances(ownerId, targetEnd, [
        { kind: "cash", amount: 1n },
        { kind: "savings_deposit", amount: 1n },
        { kind: "cash_equivalent", amount: 1n },
      ]),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await getMonthlyHistory(otherOwnerId, targetMonth)).toMatchObject({
      state: "open",
    });
    expect(
      (await getMonthlyHistory(otherOwnerId, targetMonth)).transactions,
    ).toHaveLength(1);
  });

  it("preserves debt and category labels after live records are archived or removed", async () => {
    await expect(deleteCategory(ownerId, categoryId)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await deleteDebt(ownerId, settledDebtId);
    const afterArchive = await getMonthlyHistory(ownerId, targetMonth);
    expect(
      afterArchive.debtBalances.find(
        (record) => record.sourceDebtId === settledDebtId,
      ),
    ).toMatchObject({
      borrowerName: "Nợ đã tất toán",
      closingBalance: "0",
    });
    expect(
      afterArchive.debtPayments.find(
        (payment) => payment.borrowerName === "Nợ đã tất toán",
      ),
    ).toMatchObject({ principalAmount: "100", interestAmount: "10" });

    await db
      .delete(transaction)
      .where(eq(transaction.id, createdTransactionId));
    await db.delete(category).where(eq(category.id, categoryId));
    const retained = await getMonthlyHistory(ownerId, targetMonth);
    expect(
      retained.transactions.find(
        (record) => record.sourceTransactionId === createdTransactionId,
      ),
    ).toMatchObject({
      categoryName: sourceCategoryName,
      description: "Chi tiêu tháng chốt",
    });
  });

  it("previews a selected range, finalizes only after explicit confirmation, then catches up", async () => {
    const selectedStart = monthsBefore(targetMonth, 2);
    const selectedEnd = monthsBefore(targetMonth, 1);
    const outOfScopeMonth = monthsBefore(selectedStart, 1);
    const [backfillCategory] = await db
      .insert(category)
      .values({
        userId: backfillOwnerId,
        name: "Thu lịch sử",
        kind: "income",
      })
      .returning();
    await createTransaction(backfillOwnerId, {
      categoryId: backfillCategory.id,
      kind: "income",
      amount: "50",
      occurredOn: `${outOfScopeMonth}-15`,
      description: "Ngoài khoảng chọn",
    });
    await createTransaction(backfillOwnerId, {
      categoryId: backfillCategory.id,
      kind: "income",
      amount: "75",
      occurredOn: `${selectedEnd}-15`,
      description: "Trong khoảng chọn",
    });
    await createDebt(
      backfillOwnerId,
      debtInput("Nợ cần bổ sung mốc", currentStart, "700"),
    );

    await closeMissingMonthsThroughPreviousMonth(backfillOwnerId);
    expect(
      await db
        .select()
        .from(monthlyHistorySnapshot)
        .where(eq(monthlyHistorySnapshot.userId, backfillOwnerId)),
    ).toHaveLength(0);

    const preview = await previewBackfillRange(
      backfillOwnerId,
      selectedStart,
      selectedEnd,
    );
    expect(preview.months.map((month) => month.month)).toEqual([
      selectedStart,
      selectedEnd,
    ]);
    expect(preview.transactionCount).toBe(1);
    expect(preview.unresolvedDebtCount).toBeGreaterThan(0);
    expect(preview.earlierDataMonths).toContain(outOfScopeMonth);

    await finalizeHistoricalBackfill(
      backfillOwnerId,
      selectedStart,
      selectedEnd,
    );
    const rows = await db
      .select({
        month: monthlyHistorySnapshot.month,
        closeKind: monthlyHistorySnapshot.closeKind,
      })
      .from(monthlyHistorySnapshot)
      .where(eq(monthlyHistorySnapshot.userId, backfillOwnerId));
    const byMonth = new Map(rows.map((row) => [row.month, row.closeKind]));
    expect(byMonth.get(selectedStart)).toBe("backfill");
    expect(byMonth.get(selectedEnd)).toBe("backfill");
    expect(byMonth.get(targetMonth)).toBe("automatic");
    expect(byMonth.has(outOfScopeMonth)).toBe(false);
    expect(byMonth.has(currentMonth)).toBe(false);
    expect(rows).toHaveLength(3);

    const [state] = await db
      .select()
      .from(historyBackfillState)
      .where(eq(historyBackfillState.userId, backfillOwnerId));
    expect(state).toMatchObject({
      startMonth: selectedStart,
      endMonth: selectedEnd,
    });

    await closeMissingMonthsThroughPreviousMonth(backfillOwnerId);
    expect(
      await db
        .select()
        .from(monthlyHistorySnapshot)
        .where(eq(monthlyHistorySnapshot.userId, backfillOwnerId)),
    ).toHaveLength(3);
    await expect(
      finalizeHistoricalBackfill(backfillOwnerId, selectedStart, selectedEnd),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      finalizeHistoricalBackfill(backfillOwnerId, currentMonth, currentMonth),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});
