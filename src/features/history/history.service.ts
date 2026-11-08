import { previousMonth } from "@/features/dashboard/dashboard.service";
import { parseTransactionMonth } from "@/features/transactions/transaction.validation";
import { DomainError } from "@/lib/errors";
import {
  createMonthlySnapshot,
  enumerateMonths,
  finalizeBackfillSnapshots,
  getBackfillState,
  listDebtPaymentHistoryRecords,
  listLiveHistoryTransactions,
  listMonthsWithDataBefore,
  loadMonthlySnapshotDetails,
  previewHistoryMonth,
} from "./history.repository";

type PaymentRecord = Readonly<{
  id: string;
  debtId: string;
  period: string;
  paidOn: string;
  principalAmount: bigint;
  interestAmount: bigint;
  borrowerName: string;
  loanType: string;
}>;

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function serializePayments(
  records: readonly PaymentRecord[],
): readonly DebtPaymentHistoryDto[] {
  return records.map((payment) => ({
    ...payment,
    principalAmount: payment.principalAmount.toString(),
    interestAmount: payment.interestAmount.toString(),
    totalAmount: (payment.principalAmount + payment.interestAmount).toString(),
  }));
}

export type DebtPaymentHistoryDto = Readonly<{
  id: string;
  debtId: string;
  period: string;
  paidOn: string;
  principalAmount: string;
  interestAmount: string;
  totalAmount: string;
  borrowerName: string;
  loanType: string;
}>;

export async function getMonthlyHistory(userId: string, input: unknown) {
  const month = parseTransactionMonth(input);
  const snapshot = await loadMonthlySnapshotDetails(userId, month);
  if (snapshot) {
    return {
      month,
      state: "closed" as const,
      closedAt: snapshot.snapshot.closedAt,
      closeKind: snapshot.snapshot.closeKind,
      summary: {
        incomeTotal: snapshot.snapshot.incomeTotal.toString(),
        expenseTotal: snapshot.snapshot.expenseTotal.toString(),
        knownDebtTotal: snapshot.snapshot.knownDebtTotal.toString(),
        unresolvedDebtCount: snapshot.snapshot.unresolvedDebtCount,
      },
      transactions: snapshot.transactions.map((record) => ({
        ...record,
        amount: record.amount.toString(),
      })),
      assets: snapshot.assets.map((record) => ({
        ...record,
        amount: record.amount.toString(),
      })),
      debtBalances: snapshot.debts.map((record) => ({
        ...record,
        closingBalance: record.closingBalance?.toString() ?? null,
      })),
      debtPayments: serializePayments(
        snapshot.payments.map((payment) => ({
          id: payment.sourcePaymentId,
          debtId: payment.sourceDebtId,
          period: payment.period,
          paidOn: payment.paidOn,
          principalAmount: payment.principalAmount,
          interestAmount: payment.interestAmount,
          borrowerName: payment.borrowerName,
          loanType: payment.loanType,
        })),
      ),
    };
  }

  const [transactions, debtPayments] = await Promise.all([
    listLiveHistoryTransactions(userId, month),
    listDebtPaymentHistoryRecords(userId, month),
  ]);
  return {
    month,
    state: month >= currentMonth() ? ("current" as const) : ("open" as const),
    closedAt: null,
    closeKind: null,
    summary: null,
    transactions: transactions.map((record) => ({
      ...record,
      amount: record.amount.toString(),
    })),
    assets: [],
    debtBalances: [],
    debtPayments: serializePayments(debtPayments),
  };
}

export type BackfillMonthPreview = Awaited<
  ReturnType<typeof previewHistoryMonth>
>;

export async function previewBackfillRange(
  userId: string,
  startInput: unknown,
  endInput: unknown,
) {
  const startMonth = parseTransactionMonth(startInput);
  const endMonth = parseTransactionMonth(endInput);
  if (startMonth > endMonth || endMonth >= currentMonth()) {
    throw new DomainError("INVALID_INPUT", [
      { field: "month", message: "Chọn khoảng tháng đã kết thúc hợp lệ." },
    ]);
  }
  if (await getBackfillState(userId)) {
    throw new DomainError("CONFLICT", [
      { field: "backfill", message: "Quy trình nhập lịch sử đã hoàn tất." },
    ]);
  }

  const months = enumerateMonths(startMonth, endMonth);
  const [previews, earlierDataMonths] = await Promise.all([
    Promise.all(months.map((month) => previewHistoryMonth(userId, month))),
    listMonthsWithDataBefore(userId, startMonth),
  ]);
  return {
    startMonth,
    endMonth,
    months: previews,
    transactionCount: previews.reduce(
      (total, preview) => total + preview.transactionCount,
      0,
    ),
    unresolvedDebtCount: previews.reduce(
      (total, preview) => total + preview.unresolvedDebts.length,
      0,
    ),
    earlierDataMonths,
  };
}

export async function finalizeHistoricalBackfill(
  userId: string,
  startInput: unknown,
  endInput: unknown,
): Promise<void> {
  const startMonth = parseTransactionMonth(startInput);
  const endMonth = parseTransactionMonth(endInput);
  await finalizeBackfillSnapshots(userId, startMonth, endMonth);
  await closeMissingMonthsThroughPreviousMonth(userId);
}

export async function closeMissingMonthsThroughPreviousMonth(
  userId: string,
): Promise<void> {
  const state = await getBackfillState(userId);
  if (!state) return;

  const lastClosedMonth = previousMonth(currentMonth());
  if (state.startMonth > lastClosedMonth) return;
  for (const month of enumerateMonths(state.startMonth, lastClosedMonth)) {
    await createMonthlySnapshot(
      userId,
      month,
      month <= state.endMonth ? "backfill" : "automatic",
    );
  }
}
