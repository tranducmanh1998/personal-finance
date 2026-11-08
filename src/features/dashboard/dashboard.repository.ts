import { and, desc, eq, gte, isNull, lt, lte } from "drizzle-orm";
import { assetBalance } from "@/db/schema/assets";
import { category } from "@/db/schema/categories";
import { debt } from "@/db/schema/debts";
import { debtPayment } from "@/db/schema/debt-payments";
import { transaction } from "@/db/schema/finance";
import { getDb, type Database } from "@/db";
import {
  calculateDashboardSummary,
  monthRange,
  previousMonth,
  type DashboardInput,
  type DashboardSummary,
} from "./dashboard.service";

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function currentDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

export async function getDashboardSummary(
  userId: string,
  month = currentMonth(),
  db: Database = getDb(),
): Promise<DashboardSummary> {
  const currentRange = monthRange(month);
  const previousRange = monthRange(previousMonth(month));

  const [transactions, assetBalances, debts] = await Promise.all([
    db
      .select({
        categoryId: transaction.categoryId,
        categoryName: category.name,
        kind: transaction.kind,
        amount: transaction.amount,
        debtInterestAmount: debtPayment.interestAmount,
        occurredOn: transaction.occurredOn,
        isMonthlySavings: category.isMonthlySavings,
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
      .leftJoin(debtPayment, eq(debtPayment.transactionId, transaction.id))
      .where(
        and(
          eq(transaction.userId, userId),
          gte(transaction.occurredOn, previousRange.start),
          lt(transaction.occurredOn, currentRange.end),
        ),
      ),
    db
      .select({
        kind: assetBalance.kind,
        amount: assetBalance.amount,
        asOfDate: assetBalance.asOfDate,
      })
      .from(assetBalance)
      .where(
        and(
          eq(assetBalance.userId, userId),
          lte(assetBalance.asOfDate, currentDate()),
        ),
      )
      .orderBy(desc(assetBalance.asOfDate)),
    db
      .select({ balanceAmount: debt.balanceAmount })
      .from(debt)
      .where(and(eq(debt.userId, userId), isNull(debt.archivedAt))),
  ]);

  const latestAssets = new Map<string, string>();
  for (const balance of assetBalances) {
    if (!latestAssets.has(balance.kind)) {
      latestAssets.set(balance.kind, balance.amount.toString());
    }
  }

  const input: DashboardInput = {
    month,
    transactions: transactions.map((item) => ({
      categoryId: item.categoryId,
      categoryName: item.categoryName,
      kind: item.kind,
      amount: (item.debtInterestAmount ?? item.amount).toString(),
      occurredOn: item.occurredOn,
      isMonthlySavings:
        item.debtInterestAmount === null ? item.isMonthlySavings : false,
    })),
    assets: [...latestAssets.entries()].map(([kind, amount]) => ({
      kind,
      amount,
    })),
    debts: debts.map((item) => ({
      balanceAmount: item.balanceAmount.toString(),
    })),
  };
  return calculateDashboardSummary(input);
}

export async function getLatestAssetBalances(
  userId: string,
): Promise<
  ReadonlyMap<string, Readonly<{ amount: string; asOfDate: string }>>
> {
  const rows = await getDb()
    .select({
      kind: assetBalance.kind,
      amount: assetBalance.amount,
      asOfDate: assetBalance.asOfDate,
    })
    .from(assetBalance)
    .where(
      and(
        eq(assetBalance.userId, userId),
        lte(assetBalance.asOfDate, currentDate()),
      ),
    )
    .orderBy(desc(assetBalance.asOfDate));

  const latest = new Map<
    string,
    Readonly<{ amount: string; asOfDate: string }>
  >();
  for (const row of rows) {
    if (!latest.has(row.kind)) {
      latest.set(row.kind, {
        amount: row.amount.toString(),
        asOfDate: row.asOfDate,
      });
    }
  }
  return latest;
}
