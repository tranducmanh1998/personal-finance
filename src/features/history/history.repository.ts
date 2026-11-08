import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  lte,
  lt,
  sql,
} from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { assetBalance } from "@/db/schema/assets";
import { category } from "@/db/schema/categories";
import { debt } from "@/db/schema/debts";
import { debtPayment } from "@/db/schema/debt-payments";
import {
  historyAssetSnapshot,
  historyBackfillState,
  historyDebtPaymentSnapshot,
  historyDebtSnapshot,
  historyTransactionSnapshot,
  monthlyHistorySnapshot,
} from "@/db/schema/history";
import { transaction } from "@/db/schema/finance";
import { DomainError } from "@/lib/errors";
import { monthRange } from "@/features/dashboard/dashboard.service";
import {
  lockHistoryMonth,
  type HistoryExecutor,
} from "./month-lock.repository";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function monthEndInclusive(month: string): string {
  const date = new Date(`${monthRange(month).end}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function debtClosingAmount(
  amountAtAnchor: bigint,
  anchorDate: string,
  monthEnd: string,
  principalPaidAfterAnchor: bigint,
): bigint | null {
  if (anchorDate > monthEnd) return null;
  const closingAmount = amountAtAnchor - principalPaidAfterAnchor;
  return closingAmount >= 0n ? closingAmount : null;
}

export async function getBackfillState(
  userId: string,
  executor: HistoryExecutor = getDb(),
) {
  const [state] = await executor
    .select()
    .from(historyBackfillState)
    .where(eq(historyBackfillState.userId, userId))
    .limit(1);
  return state ?? null;
}

export async function getExistingMonthlySnapshot(
  userId: string,
  month: string,
  executor: HistoryExecutor = getDb(),
) {
  const [snapshot] = await executor
    .select()
    .from(monthlyHistorySnapshot)
    .where(
      and(
        eq(monthlyHistorySnapshot.userId, userId),
        eq(monthlyHistorySnapshot.month, month),
      ),
    )
    .limit(1);
  return snapshot ?? null;
}

export async function previewHistoryMonth(userId: string, month: string) {
  const db = getDb();
  const { start, end } = monthRange(month);
  const monthEnd = monthEndInclusive(month);
  const [transactions, debts] = await Promise.all([
    db
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(
          eq(transaction.userId, userId),
          gte(transaction.occurredOn, start),
          lt(transaction.occurredOn, end),
        ),
      ),
    db
      .select({
        borrowerName: debt.borrowerName,
        loanType: debt.loanType,
        balanceAsOf: debt.balanceAsOf,
      })
      .from(debt)
      .where(eq(debt.userId, userId)),
  ]);
  return {
    month,
    transactionCount: transactions.length,
    unresolvedDebts: debts
      .filter((record) => record.balanceAsOf > monthEnd)
      .map((record) => ({
        borrowerName: record.borrowerName,
        loanType: record.loanType,
        balanceAsOf: record.balanceAsOf,
      })),
  };
}

export async function listLiveHistoryTransactions(
  userId: string,
  month: string,
  db: Database = getDb(),
) {
  const { start, end } = monthRange(month);
  return db
    .select({
      id: transaction.id,
      sourceTransactionId: transaction.id,
      occurredOn: transaction.occurredOn,
      kind: transaction.kind,
      amount: transaction.amount,
      categoryId: transaction.categoryId,
      categoryName: category.name,
      description: transaction.description,
      isDebtPayment: sql<boolean>`${debtPayment.id} IS NOT NULL`,
    })
    .from(transaction)
    .innerJoin(
      category,
      and(
        eq(category.id, transaction.categoryId),
        eq(category.userId, transaction.userId),
        eq(category.kind, transaction.kind),
      ),
    )
    .leftJoin(
      debtPayment,
      and(
        eq(debtPayment.transactionId, transaction.id),
        eq(debtPayment.userId, transaction.userId),
      ),
    )
    .where(
      and(
        eq(transaction.userId, userId),
        gte(transaction.occurredOn, start),
        lt(transaction.occurredOn, end),
      ),
    )
    .orderBy(asc(transaction.occurredOn), asc(transaction.createdAt));
}

export async function listDebtPaymentHistoryRecords(
  userId: string,
  month: string,
  db: Database = getDb(),
) {
  const range = monthRange(month);
  return db
    .select({
      id: debtPayment.id,
      debtId: debtPayment.debtId,
      period: debtPayment.period,
      paidOn: debtPayment.paidOn,
      principalAmount: debtPayment.principalAmount,
      interestAmount: debtPayment.interestAmount,
      borrowerName: debt.borrowerName,
      loanType: debt.loanType,
    })
    .from(debtPayment)
    .innerJoin(
      debt,
      and(eq(debtPayment.debtId, debt.id), eq(debtPayment.userId, debt.userId)),
    )
    .where(
      and(
        eq(debtPayment.userId, userId),
        gte(debtPayment.paidOn, range.start),
        lt(debtPayment.paidOn, range.end),
      ),
    )
    .orderBy(asc(debtPayment.paidOn), asc(debtPayment.period));
}

export async function insertMonthlySnapshot(
  executor: HistoryExecutor,
  userId: string,
  month: string,
  closeKind: "automatic" | "backfill",
) {
  const { start, end } = monthRange(month);
  const monthEnd = monthEndInclusive(month);

  const transactions = await executor
    .select({
      ...getTableColumns(transaction),
      categoryName: category.name,
      isDebtPayment: sql<boolean>`${debtPayment.id} IS NOT NULL`,
    })
    .from(transaction)
    .innerJoin(
      category,
      and(
        eq(category.id, transaction.categoryId),
        eq(category.userId, transaction.userId),
        eq(category.kind, transaction.kind),
      ),
    )
    .leftJoin(
      debtPayment,
      and(
        eq(debtPayment.transactionId, transaction.id),
        eq(debtPayment.userId, transaction.userId),
      ),
    )
    .where(
      and(
        eq(transaction.userId, userId),
        gte(transaction.occurredOn, start),
        lt(transaction.occurredOn, end),
      ),
    )
    .orderBy(asc(transaction.occurredOn), asc(transaction.createdAt));

  const paymentRecords = await executor
    .select({
      id: debtPayment.id,
      debtId: debtPayment.debtId,
      period: debtPayment.period,
      paidOn: debtPayment.paidOn,
      principalAmount: debtPayment.principalAmount,
      interestAmount: debtPayment.interestAmount,
      borrowerName: debt.borrowerName,
      loanType: debt.loanType,
    })
    .from(debtPayment)
    .innerJoin(
      debt,
      and(eq(debtPayment.debtId, debt.id), eq(debtPayment.userId, debt.userId)),
    )
    .where(
      and(
        eq(debtPayment.userId, userId),
        gte(debtPayment.paidOn, start),
        lt(debtPayment.paidOn, end),
      ),
    )
    .orderBy(asc(debtPayment.paidOn), asc(debtPayment.period));

  const debtRows = await executor
    .select({
      id: debt.id,
      borrowerName: debt.borrowerName,
      loanType: debt.loanType,
      balanceAsOf: debt.balanceAsOf,
      balanceAmount: debt.balanceAmount,
    })
    .from(debt)
    .where(eq(debt.userId, userId));

  const datedPayments = await executor
    .select({
      debtId: debtPayment.debtId,
      paidOn: debtPayment.paidOn,
      principalAmount: debtPayment.principalAmount,
    })
    .from(debtPayment)
    .where(
      and(eq(debtPayment.userId, userId), lte(debtPayment.paidOn, monthEnd)),
    );

  const debtSnapshots = debtRows.map((record) => {
    const principalPaidAfterAnchor = datedPayments
      .filter(
        (payment) =>
          payment.debtId === record.id &&
          payment.paidOn > record.balanceAsOf &&
          payment.paidOn <= monthEnd,
      )
      .reduce((total, payment) => total + payment.principalAmount, 0n);
    const closingBalance = debtClosingAmount(
      record.balanceAmount,
      record.balanceAsOf,
      monthEnd,
      principalPaidAfterAnchor,
    );
    return {
      sourceDebtId: record.id,
      borrowerName: record.borrowerName,
      loanType: record.loanType,
      balanceAsOf: record.balanceAsOf,
      closingBalance,
      balanceStatus:
        closingBalance === null
          ? ("insufficient_history" as const)
          : ("complete" as const),
    };
  });

  const assetRows = await executor
    .select({
      kind: assetBalance.kind,
      amount: assetBalance.amount,
      asOfDate: assetBalance.asOfDate,
    })
    .from(assetBalance)
    .where(
      and(
        eq(assetBalance.userId, userId),
        lte(assetBalance.asOfDate, monthEnd),
      ),
    )
    .orderBy(desc(assetBalance.asOfDate));
  const latestAssets = new Map<string, (typeof assetRows)[number]>();
  for (const asset of assetRows) {
    if (!latestAssets.has(asset.kind)) latestAssets.set(asset.kind, asset);
  }

  const incomeTotal = transactions
    .filter((record) => record.kind === "income" && !record.isDebtPayment)
    .reduce((total, record) => total + record.amount, 0n);
  const expenseTotal =
    transactions
      .filter((record) => record.kind === "expense" && !record.isDebtPayment)
      .reduce((total, record) => total + record.amount, 0n) +
    paymentRecords.reduce((total, record) => total + record.interestAmount, 0n);
  const knownDebtTotal = debtSnapshots
    .filter((record) => record.closingBalance !== null)
    .reduce((total, record) => total + (record.closingBalance ?? 0n), 0n);

  const [snapshot] = await executor
    .insert(monthlyHistorySnapshot)
    .values({
      userId,
      month,
      periodStart: start,
      periodEndExclusive: end,
      closeKind,
      incomeTotal,
      expenseTotal,
      knownDebtTotal,
      unresolvedDebtCount: debtSnapshots.filter(
        (record) => record.closingBalance === null,
      ).length,
    })
    .returning();
  if (!snapshot) {
    throw new Error("Could not create the monthly history snapshot.");
  }

  if (transactions.length > 0) {
    await executor.insert(historyTransactionSnapshot).values(
      transactions.map((record) => ({
        snapshotId: snapshot.id,
        sourceTransactionId: record.id,
        occurredOn: record.occurredOn,
        kind: record.kind,
        amount: record.amount,
        categoryId: record.categoryId,
        categoryName: record.categoryName,
        description: record.description,
        isDebtPayment: record.isDebtPayment,
      })),
    );
  }
  if (paymentRecords.length > 0) {
    await executor.insert(historyDebtPaymentSnapshot).values(
      paymentRecords.map((record) => ({
        snapshotId: snapshot.id,
        sourcePaymentId: record.id,
        sourceDebtId: record.debtId,
        period: record.period,
        paidOn: record.paidOn,
        principalAmount: record.principalAmount,
        interestAmount: record.interestAmount,
        borrowerName: record.borrowerName,
        loanType: record.loanType,
      })),
    );
  }
  if (debtSnapshots.length > 0) {
    await executor.insert(historyDebtSnapshot).values(
      debtSnapshots.map((record) => ({
        snapshotId: snapshot.id,
        ...record,
      })),
    );
  }
  if (latestAssets.size > 0) {
    await executor.insert(historyAssetSnapshot).values(
      [...latestAssets.values()].map((record) => ({
        snapshotId: snapshot.id,
        kind: record.kind,
        amount: record.amount,
        asOfDate: record.asOfDate,
      })),
    );
  }
  return snapshot;
}

export async function createMonthlySnapshot(
  userId: string,
  month: string,
  closeKind: "automatic" | "backfill",
  db: Database = getDb(),
) {
  if (month >= currentMonth()) {
    throw new DomainError("INVALID_INPUT", [
      { field: "month", message: "Chỉ có thể chốt tháng đã kết thúc." },
    ]);
  }
  return db.transaction(async (tx) => {
    await lockHistoryMonth(tx, userId, month);
    const existing = await getExistingMonthlySnapshot(userId, month, tx);
    if (existing) return existing;
    if (!(await getBackfillState(userId, tx))) {
      throw new DomainError("CONFLICT", [
        {
          field: "backfill",
          message: "Chưa xác nhận hoàn tất nhập lịch sử.",
        },
      ]);
    }
    if (month >= currentMonth()) {
      throw new DomainError("INVALID_INPUT", [
        { field: "month", message: "Chỉ có thể chốt tháng đã kết thúc." },
      ]);
    }
    return insertMonthlySnapshot(tx, userId, month, closeKind);
  });
}

export async function loadMonthlySnapshotDetails(
  userId: string,
  month: string,
  db: Database = getDb(),
) {
  const snapshot = await getExistingMonthlySnapshot(userId, month, db);
  if (!snapshot) return null;
  const [transactions, assets, debts, payments] = await Promise.all([
    db
      .select()
      .from(historyTransactionSnapshot)
      .where(eq(historyTransactionSnapshot.snapshotId, snapshot.id))
      .orderBy(asc(historyTransactionSnapshot.occurredOn)),
    db
      .select()
      .from(historyAssetSnapshot)
      .where(eq(historyAssetSnapshot.snapshotId, snapshot.id)),
    db
      .select()
      .from(historyDebtSnapshot)
      .where(eq(historyDebtSnapshot.snapshotId, snapshot.id))
      .orderBy(asc(historyDebtSnapshot.borrowerName)),
    db
      .select()
      .from(historyDebtPaymentSnapshot)
      .where(eq(historyDebtPaymentSnapshot.snapshotId, snapshot.id))
      .orderBy(asc(historyDebtPaymentSnapshot.paidOn)),
  ]);
  return { snapshot, transactions, assets, debts, payments };
}

export async function finalizeBackfillSnapshots(
  userId: string,
  startMonth: string,
  endMonth: string,
  db: Database = getDb(),
): Promise<void> {
  if (startMonth > endMonth || endMonth >= currentMonth()) {
    throw new DomainError("INVALID_INPUT", [
      { field: "month", message: "Chọn khoảng tháng đã kết thúc hợp lệ." },
    ]);
  }

  await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`personal-finance-backfill:${userId}`}, 0))`,
    );
    const existingState = await getBackfillState(userId, tx);
    if (existingState) {
      throw new DomainError("CONFLICT", [
        { field: "backfill", message: "Quy trình nhập lịch sử đã hoàn tất." },
      ]);
    }

    for (const month of enumerateMonths(startMonth, endMonth)) {
      await lockHistoryMonth(tx, userId, month);
      if (month >= currentMonth()) {
        throw new DomainError("INVALID_INPUT", [
          { field: "month", message: "Chỉ có thể chốt tháng đã kết thúc." },
        ]);
      }
      if (!(await getExistingMonthlySnapshot(userId, month, tx))) {
        await insertMonthlySnapshot(tx, userId, month, "backfill");
      }
    }
    await tx.insert(historyBackfillState).values({
      userId,
      startMonth,
      endMonth,
    });
  });
}

export async function listMonthsWithDataBefore(
  userId: string,
  startMonth: string,
  db: Database = getDb(),
): Promise<readonly string[]> {
  const transactionMonth = sql<string>`substring(${transaction.occurredOn}::text, 1, 7)`;
  const assetMonth = sql<string>`substring(${assetBalance.asOfDate}::text, 1, 7)`;
  const debtMonth = sql<string>`substring(${debt.balanceAsOf}::text, 1, 7)`;
  const paymentMonth = sql<string>`substring(${debtPayment.paidOn}::text, 1, 7)`;
  const [transactionMonths, assetMonths, debtMonths, paymentMonths] =
    await Promise.all([
      db
        .selectDistinct({ month: transactionMonth })
        .from(transaction)
        .where(
          and(
            eq(transaction.userId, userId),
            lt(transaction.occurredOn, `${startMonth}-01`),
          ),
        ),
      db
        .selectDistinct({ month: assetMonth })
        .from(assetBalance)
        .where(
          and(
            eq(assetBalance.userId, userId),
            lt(assetBalance.asOfDate, `${startMonth}-01`),
          ),
        ),
      db
        .selectDistinct({ month: debtMonth })
        .from(debt)
        .where(
          and(
            eq(debt.userId, userId),
            lt(debt.balanceAsOf, `${startMonth}-01`),
          ),
        ),
      db
        .selectDistinct({ month: paymentMonth })
        .from(debtPayment)
        .where(
          and(
            eq(debtPayment.userId, userId),
            lt(debtPayment.paidOn, `${startMonth}-01`),
          ),
        ),
    ]);
  return [
    ...new Set(
      [
        ...transactionMonths,
        ...assetMonths,
        ...debtMonths,
        ...paymentMonths,
      ].map((record) => record.month),
    ),
  ].sort();
}

export function enumerateMonths(
  startMonth: string,
  endMonth: string,
): string[] {
  const months: string[] = [];
  const cursor = new Date(`${startMonth}-01T00:00:00.000Z`);
  const end = new Date(`${endMonth}-01T00:00:00.000Z`);
  while (cursor <= end) {
    months.push(
      `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`,
    );
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return months;
}
