import { z } from "zod";
import { saveAssetBalances } from "@/features/assets/asset.repository";
import { createDebt } from "@/features/debts/debt.service";
import { parseDebtInput } from "@/features/debts/debt.validation";
import { createTransaction } from "@/features/transactions/transaction.service";
import { parseTransactionInput } from "@/features/transactions/transaction.validation";
import { DomainError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";

const maximumPostgresBigint = 9_223_372_036_854_775_807n;
const amountSchema = z
  .string()
  .regex(/^\d+$/)
  .refine((value) => BigInt(value) <= maximumPostgresBigint);

const assetBackfillSchema = z.object({
  asOfDate: z.string().date(),
  cash: amountSchema,
  savingsDeposit: amountSchema,
  cashEquivalent: amountSchema,
});

function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

function requirePastDate(date: string, field: string): void {
  if (date >= localDate()) {
    throw new DomainError("INVALID_INPUT", [
      {
        field,
        message: "Chỉ nhập dữ liệu có ngày trước hôm nay.",
      },
    ]);
  }
}

export async function backfillHistoricalTransaction(
  userId: string,
  input: unknown,
) {
  const parsed = parseTransactionInput(input);
  requirePastDate(parsed.occurredOn, "occurredOn");
  return createTransaction(userId, input);
}

export async function backfillHistoricalAssetBalances(
  userId: string,
  input: unknown,
): Promise<void> {
  const values = validateInput(assetBackfillSchema, input);
  requirePastDate(values.asOfDate, "asOfDate");
  await saveAssetBalances(userId, values.asOfDate, [
    { kind: "cash", amount: BigInt(values.cash) },
    { kind: "savings_deposit", amount: BigInt(values.savingsDeposit) },
    { kind: "cash_equivalent", amount: BigInt(values.cashEquivalent) },
  ]);
}

export async function backfillHistoricalDebt(userId: string, input: unknown) {
  const parsed = parseDebtInput(input);
  requirePastDate(parsed.balanceAsOf, "balanceAsOf");
  return createDebt(userId, input);
}
