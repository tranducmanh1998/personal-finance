import { and, asc, desc, eq, getTableColumns, gte, lt, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { cashFlowOccurrenceMatch } from "@/db/schema/cash-flow";
import { debtPayment } from "@/db/schema/debt-payments";
import { transaction } from "@/db/schema/finance";
import { DomainError } from "@/lib/errors";
import { ensureOtherCategories } from "@/features/categories/category.repository";
import { monthRange } from "@/features/dashboard/dashboard.service";
import { lockAndAssertOpenMonths } from "@/features/history/month-lock.repository";
import type { ResolvedTransactionInput } from "./transaction.validation";

export async function resolveTransactionCategoryId(
  userId: string,
  categoryId: string | null,
  kind: "income" | "expense",
  db: Database = getDb(),
): Promise<string | null> {
  if (categoryId !== null) {
    const [matchingCategory] = await db
      .select({ id: category.id })
      .from(category)
      .where(
        and(
          eq(category.id, categoryId),
          eq(category.userId, userId),
          eq(category.kind, kind),
        ),
      )
      .limit(1);
    return matchingCategory?.id ?? null;
  }

  await ensureOtherCategories(userId, db);
  const [fallbackCategory] = await db
    .select({ id: category.id })
    .from(category)
    .where(
      and(
        eq(category.userId, userId),
        eq(category.kind, kind),
        eq(category.name, "Khác"),
      ),
    )
    .limit(1);
  if (!fallbackCategory) {
    throw new Error(
      "Could not resolve the matching Khác transaction category.",
    );
  }
  return fallbackCategory.id;
}

export async function createTransactionRecord(
  userId: string,
  input: ResolvedTransactionInput,
  db: Database = getDb(),
) {
  return db.transaction(async (tx) => {
    await lockAndAssertOpenMonths(userId, [input.occurredOn.slice(0, 7)], tx);
    const [created] = await tx
      .insert(transaction)
      .values({ userId, ...input })
      .returning();
    if (!created) {
      throw new Error("Could not create the transaction record.");
    }
    return created;
  });
}

export async function getTransactionRecord(
  userId: string,
  transactionId: string,
  db: Database = getDb(),
) {
  const [record] = await db
    .select({
      ...getTableColumns(transaction),
      isDebtPayment: sql<boolean>`${debtPayment.id} IS NOT NULL`,
    })
    .from(transaction)
    .leftJoin(
      debtPayment,
      and(
        eq(debtPayment.transactionId, transaction.id),
        eq(debtPayment.userId, transaction.userId),
      ),
    )
    .where(
      and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
    )
    .limit(1);
  return record ?? null;
}

export async function listCurrentMonthTransactionRecords(
  userId: string,
  month: string,
  db: Database = getDb(),
) {
  const range = monthRange(month);
  return db
    .select({
      ...getTableColumns(transaction),
      isDebtPayment: sql<boolean>`${debtPayment.id} IS NOT NULL`,
    })
    .from(transaction)
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
        gte(transaction.occurredOn, range.start),
        lt(transaction.occurredOn, range.end),
      ),
    )
    .orderBy(desc(transaction.occurredOn), asc(transaction.createdAt));
}

async function assertTransactionIsNotDebtPayment(
  transactionId: string,
  userId: string,
  db: Database,
): Promise<void> {
  const [payment] = await db
    .select({ id: debtPayment.id })
    .from(debtPayment)
    .where(
      and(
        eq(debtPayment.transactionId, transactionId),
        eq(debtPayment.userId, userId),
      ),
    )
    .limit(1);
  if (payment) {
    throw new DomainError("CONFLICT", [
      {
        field: "transactionId",
        message:
          "Không thể sửa hoặc xóa giao dịch thanh toán nợ tại đây; hãy quản lý thanh toán từ khoản nợ.",
      },
    ]);
  }
}

async function assertTransactionIsNotCashFlowMatched(
  transactionId: string,
  userId: string,
  db: Database,
): Promise<void> {
  const [match] = await db
    .select({ id: cashFlowOccurrenceMatch.id })
    .from(cashFlowOccurrenceMatch)
    .where(
      and(
        eq(cashFlowOccurrenceMatch.transactionId, transactionId),
        eq(cashFlowOccurrenceMatch.userId, userId),
      ),
    )
    .limit(1);
  if (match) {
    throw new DomainError("CONFLICT", [
      {
        field: "transactionId",
        message:
          "Hãy gỡ giao dịch khỏi khoản dự kiến trước khi sửa hoặc xóa giao dịch.",
      },
    ]);
  }
}

export async function updateTransactionRecord(
  userId: string,
  transactionId: string,
  input: ResolvedTransactionInput,
  db: Database = getDb(),
) {
  return db.transaction(async (tx) => {
    const [ownedTransaction] = await tx
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .for("update")
      .limit(1);
    if (!ownedTransaction) {
      return null;
    }

    const [current] = await tx
      .select({ occurredOn: transaction.occurredOn })
      .from(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .limit(1);
    if (!current) {
      return null;
    }
    await lockAndAssertOpenMonths(
      userId,
      [current.occurredOn.slice(0, 7), input.occurredOn.slice(0, 7)],
      tx,
    );
    await assertTransactionIsNotDebtPayment(transactionId, userId, tx);
    await assertTransactionIsNotCashFlowMatched(transactionId, userId, tx);
    const [updated] = await tx
      .update(transaction)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .returning();
    return updated ?? null;
  });
}

export async function deleteTransactionRecord(
  userId: string,
  transactionId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ownedTransaction] = await tx
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .for("update")
      .limit(1);
    if (!ownedTransaction) {
      return false;
    }

    const [current] = await tx
      .select({ occurredOn: transaction.occurredOn })
      .from(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .limit(1);
    if (!current) {
      return false;
    }
    await lockAndAssertOpenMonths(userId, [current.occurredOn.slice(0, 7)], tx);
    await assertTransactionIsNotDebtPayment(transactionId, userId, tx);
    await assertTransactionIsNotCashFlowMatched(transactionId, userId, tx);
    const deleted = await tx
      .delete(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .returning({ id: transaction.id });
    return deleted.length > 0;
  });
}
