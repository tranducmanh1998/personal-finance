import { and, desc, eq, getTableColumns, isNull, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { debtPayment } from "@/db/schema/debt-payments";
import { goal, goalTransaction } from "@/db/schema/goals";
import { transaction } from "@/db/schema/finance";
import { DomainError } from "@/lib/errors";

export async function createGoalRecord(
  userId: string,
  values: Readonly<{
    name: string;
    targetAmount: bigint;
    targetDate: string | null;
  }>,
  db: Database = getDb(),
) {
  const [created] = await db
    .insert(goal)
    .values({ userId, ...values })
    .returning();
  if (!created) {
    throw new Error("Could not create the savings goal.");
  }
  return created;
}

export async function listGoalRecords(userId: string, db: Database = getDb()) {
  const goals = await db
    .select(getTableColumns(goal))
    .from(goal)
    .where(eq(goal.userId, userId))
    .orderBy(desc(goal.createdAt), desc(goal.name));
  if (goals.length === 0) {
    return [];
  }

  const progressRows = await db
    .select({
      goalId: goalTransaction.goalId,
      progress: sql<string>`coalesce(sum(${transaction.amount}), 0)::text`,
    })
    .from(goalTransaction)
    .innerJoin(
      transaction,
      and(
        eq(transaction.id, goalTransaction.transactionId),
        eq(transaction.userId, goalTransaction.userId),
      ),
    )
    .where(eq(goalTransaction.userId, userId))
    .groupBy(goalTransaction.goalId);
  const progressByGoalId = new Map(
    progressRows.map((row) => [row.goalId, row.progress]),
  );
  return goals.map((item) => ({
    ...item,
    progress: progressByGoalId.get(item.id) ?? "0",
  }));
}

export async function getGoalRecord(
  userId: string,
  goalId: string,
  db: Database = getDb(),
) {
  const [record] = await db
    .select()
    .from(goal)
    .where(and(eq(goal.id, goalId), eq(goal.userId, userId)))
    .limit(1);
  return record ?? null;
}

export async function updateGoalRecord(
  userId: string,
  goalId: string,
  values: Readonly<{
    name: string;
    targetAmount: bigint;
    targetDate: string | null;
  }>,
  db: Database = getDb(),
) {
  const [updated] = await db
    .update(goal)
    .set({ ...values, updatedAt: new Date() })
    .where(and(eq(goal.id, goalId), eq(goal.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function listLinkableTransactionRecords(
  userId: string,
  db: Database = getDb(),
) {
  return db
    .select({
      id: transaction.id,
      kind: transaction.kind,
      amount: transaction.amount,
      occurredOn: transaction.occurredOn,
      description: transaction.description,
      categoryName: category.name,
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
    .where(and(eq(transaction.userId, userId), isNull(debtPayment.id)))
    .orderBy(desc(transaction.occurredOn), desc(transaction.createdAt));
}

export async function listGoalTransactionIds(
  userId: string,
  goalId: string,
  db: Database = getDb(),
): Promise<readonly string[]> {
  const records = await db
    .select({ transactionId: goalTransaction.transactionId })
    .from(goalTransaction)
    .where(
      and(
        eq(goalTransaction.userId, userId),
        eq(goalTransaction.goalId, goalId),
      ),
    );
  return records.map((record) => record.transactionId);
}

export async function setGoalTransactionRecord(
  userId: string,
  goalId: string,
  transactionId: string,
  linked: boolean,
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    const [ownedGoal] = await tx
      .select({ id: goal.id })
      .from(goal)
      .where(and(eq(goal.id, goalId), eq(goal.userId, userId)))
      .for("update")
      .limit(1);
    if (!ownedGoal) {
      throw new DomainError("NOT_FOUND");
    }

    const [ownedTransaction] = await tx
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(eq(transaction.id, transactionId), eq(transaction.userId, userId)),
      )
      .limit(1);
    if (!ownedTransaction) {
      throw new DomainError("NOT_FOUND", [
        {
          field: "transactionId",
          message: "Chỉ có thể liên kết giao dịch thuộc tài khoản của bạn.",
        },
      ]);
    }

    const [payment] = await tx
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
          message: "Không thể liên kết giao dịch thanh toán nợ với mục tiêu.",
        },
      ]);
    }

    if (linked) {
      await tx
        .insert(goalTransaction)
        .values({ userId, goalId, transactionId })
        .onConflictDoNothing({
          target: [goalTransaction.goalId, goalTransaction.transactionId],
        });
      return;
    }

    await tx
      .delete(goalTransaction)
      .where(
        and(
          eq(goalTransaction.userId, userId),
          eq(goalTransaction.goalId, goalId),
          eq(goalTransaction.transactionId, transactionId),
        ),
      );
  });
}
