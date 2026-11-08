import { getDb, type Database } from "@/db";
import { assetBalance } from "@/db/schema/assets";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";
import { lockAndAssertOpenMonths } from "@/features/history/month-lock.repository";

export type AssetBalanceInput = Readonly<{
  kind: "cash" | "savings_deposit" | "cash_equivalent";
  amount: bigint;
}>;

export async function saveAssetBalances(
  userId: string,
  asOfDate: string,
  balances: readonly AssetBalanceInput[],
  db: Database = getDb(),
): Promise<void> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const updatedAt = new Date();
  await db.transaction(async (tx) => {
    await lockAndAssertOpenMonths(userId, [asOfDate.slice(0, 7)], tx);
    for (const balance of balances) {
      await tx
        .insert(assetBalance)
        .values({
          userId,
          kind: balance.kind,
          amount: balance.amount,
          asOfDate,
          updatedAt,
        })
        .onConflictDoUpdate({
          target: [
            assetBalance.userId,
            assetBalance.kind,
            assetBalance.asOfDate,
          ],
          set: { amount: balance.amount, updatedAt },
        });
    }
  });
}
