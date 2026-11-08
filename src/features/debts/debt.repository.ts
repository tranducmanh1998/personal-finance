import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { debtPayment } from "@/db/schema/debt-payments";
import { debt } from "@/db/schema/debts";
import { transaction } from "@/db/schema/finance";
import { lockAndAssertOpenMonths } from "@/features/history/month-lock.repository";
import { DomainError } from "@/lib/errors";
import type { DebtInput } from "./debt.validation";
import type { DebtPaymentInput } from "./payment.validation";

export async function createDebtRecord(
  userId: string,
  input: DebtInput,
  db: Database = getDb(),
) {
  return db.transaction(async (tx) => {
    await lockAndAssertOpenMonths(userId, [input.balanceAsOf.slice(0, 7)], tx);
    const [created] = await tx
      .insert(debt)
      .values({ userId, ...input })
      .returning();
    return created;
  });
}

export async function listDebtRecords(userId: string, db: Database = getDb()) {
  return db
    .select()
    .from(debt)
    .where(and(eq(debt.userId, userId), isNull(debt.archivedAt)))
    .orderBy(desc(debt.balanceAsOf), asc(debt.borrowerName));
}

export async function getDebtRecord(
  userId: string,
  debtId: string,
  db: Database = getDb(),
) {
  const [record] = await db
    .select()
    .from(debt)
    .where(and(eq(debt.id, debtId), eq(debt.userId, userId)))
    .limit(1);
  return record ?? null;
}

export async function listDebtPaymentRecords(
  userId: string,
  debtId: string,
  db: Database = getDb(),
) {
  return db
    .select()
    .from(debtPayment)
    .where(and(eq(debtPayment.userId, userId), eq(debtPayment.debtId, debtId)))
    .orderBy(desc(debtPayment.paidOn), desc(debtPayment.period));
}

function isDuplicatePaymentPeriod(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const databaseError = current as Readonly<{
      code?: string;
      constraint?: string;
      cause?: unknown;
    }>;
    if (
      databaseError.code === "23505" &&
      databaseError.constraint === "debt_payment_debt_period_unique"
    ) {
      return true;
    }
    current = databaseError.cause;
  }
  return false;
}

export async function createDebtPaymentRecord(
  userId: string,
  debtId: string,
  input: DebtPaymentInput,
  db: Database = getDb(),
) {
  try {
    return await db.transaction(async (tx) => {
      await lockAndAssertOpenMonths(userId, [input.paidOn.slice(0, 7)], tx);
      const [ownedDebt] = await tx
        .select()
        .from(debt)
        .where(
          and(
            eq(debt.id, debtId),
            eq(debt.userId, userId),
            isNull(debt.archivedAt),
          ),
        )
        .for("update")
        .limit(1);
      if (!ownedDebt) {
        throw new DomainError("NOT_FOUND");
      }
      if (input.principalAmount > ownedDebt.balanceAmount) {
        throw new DomainError("INVALID_INPUT", [
          {
            field: "principalAmount",
            message: "Tiền gốc vượt quá dư nợ hiện tại.",
          },
        ]);
      }

      const [existingPayment] = await tx
        .select({ id: debtPayment.id })
        .from(debtPayment)
        .where(
          and(
            eq(debtPayment.debtId, debtId),
            eq(debtPayment.period, input.period),
          ),
        )
        .limit(1);
      if (existingPayment) {
        throw new DomainError("CONFLICT", [
          { field: "period", message: "Kỳ này đã được ghi nhận." },
        ]);
      }

      await tx
        .insert(category)
        .values({ userId, name: "Khác", kind: "expense" })
        .onConflictDoNothing({
          target: [category.userId, category.kind, category.name],
        });
      const [paymentCategory] = await tx
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.userId, userId),
            eq(category.name, "Khác"),
            eq(category.kind, "expense"),
          ),
        )
        .limit(1);
      if (!paymentCategory) {
        throw new Error("Could not resolve the debt payment category.");
      }

      const [linkedTransaction] = await tx
        .insert(transaction)
        .values({
          userId,
          categoryId: paymentCategory.id,
          kind: "expense",
          amount: input.principalAmount + input.interestAmount,
          occurredOn: input.paidOn,
          description: `Thanh toán nợ ${ownedDebt.borrowerName} - kỳ ${input.period}`,
        })
        .returning({ id: transaction.id });
      if (!linkedTransaction) {
        throw new Error(
          "Could not create the linked debt payment transaction.",
        );
      }

      const [payment] = await tx
        .insert(debtPayment)
        .values({
          userId,
          debtId,
          transactionId: linkedTransaction.id,
          period: input.period,
          paidOn: input.paidOn,
          principalAmount: input.principalAmount,
          interestAmount: input.interestAmount,
        })
        .returning();
      if (!payment) {
        throw new Error("Could not create the debt payment record.");
      }

      await tx
        .update(debt)
        .set({
          balanceAmount: ownedDebt.balanceAmount - input.principalAmount,
          balanceAsOf: input.paidOn,
          updatedAt: new Date(),
        })
        .where(and(eq(debt.id, debtId), eq(debt.userId, userId)));

      return payment;
    });
  } catch (error) {
    if (isDuplicatePaymentPeriod(error)) {
      throw new DomainError("CONFLICT", [
        { field: "period", message: "Kỳ này đã được ghi nhận." },
      ]);
    }
    throw error;
  }
}

export async function updateDebtRecord(
  userId: string,
  debtId: string,
  input: DebtInput,
  db: Database = getDb(),
) {
  return db.transaction(async (tx) => {
    const [ownedDebt] = await tx
      .select({ balanceAsOf: debt.balanceAsOf })
      .from(debt)
      .where(
        and(
          eq(debt.id, debtId),
          eq(debt.userId, userId),
          isNull(debt.archivedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!ownedDebt) {
      return null;
    }
    await lockAndAssertOpenMonths(
      userId,
      [ownedDebt.balanceAsOf.slice(0, 7), input.balanceAsOf.slice(0, 7)],
      tx,
    );
    const [updated] = await tx
      .update(debt)
      .set({ ...input, updatedAt: new Date() })
      .where(
        and(
          eq(debt.id, debtId),
          eq(debt.userId, userId),
          isNull(debt.archivedAt),
        ),
      )
      .returning();
    return updated ?? null;
  });
}

export async function deleteDebtRecord(
  userId: string,
  debtId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ownedDebt] = await tx
      .select({ id: debt.id, balanceAmount: debt.balanceAmount })
      .from(debt)
      .where(
        and(
          eq(debt.id, debtId),
          eq(debt.userId, userId),
          isNull(debt.archivedAt),
        ),
      )
      .for("update")
      .limit(1);
    if (!ownedDebt) {
      return false;
    }
    if (ownedDebt.balanceAmount !== 0n) {
      throw new DomainError("CONFLICT", [
        {
          field: "balanceAmount",
          message: "Chỉ có thể xóa khoản nợ đã tất toán.",
        },
      ]);
    }

    const archivedAt = new Date();
    const [archived] = await tx
      .update(debt)
      .set({ archivedAt, updatedAt: archivedAt })
      .where(
        and(
          eq(debt.id, debtId),
          eq(debt.userId, userId),
          isNull(debt.archivedAt),
          eq(debt.balanceAmount, 0n),
        ),
      )
      .returning({ id: debt.id });
    return archived !== undefined;
  });
}
