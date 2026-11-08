import { and, eq, sql } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { monthlyHistorySnapshot } from "@/db/schema/history";
import { DomainError } from "@/lib/errors";

export type HistoryExecutor = Pick<Database, "execute" | "insert" | "select">;

export async function lockHistoryMonth(
  executor: HistoryExecutor,
  userId: string,
  month: string,
): Promise<void> {
  await executor.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`personal-finance:${userId}:${month}`}))`,
  );
}

export async function assertHistoryMonthOpen(
  userId: string,
  month: string,
  executor: HistoryExecutor = getDb(),
): Promise<void> {
  const [snapshot] = await executor
    .select({ id: monthlyHistorySnapshot.id })
    .from(monthlyHistorySnapshot)
    .where(
      and(
        eq(monthlyHistorySnapshot.userId, userId),
        eq(monthlyHistorySnapshot.month, month),
      ),
    )
    .limit(1);
  if (snapshot) {
    throw new DomainError("CONFLICT", [
      {
        field: "month",
        message: "Kỳ đã chốt, không thể thay đổi dữ liệu.",
      },
    ]);
  }
}

export async function lockAndAssertOpenMonths(
  userId: string,
  months: readonly string[],
  executor: HistoryExecutor = getDb(),
): Promise<void> {
  for (const month of [...new Set(months)].sort()) {
    await lockHistoryMonth(executor, userId, month);
    await assertHistoryMonthOpen(userId, month, executor);
  }
}
