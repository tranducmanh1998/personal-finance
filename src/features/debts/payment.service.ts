import {
  createDebtPaymentRecord,
  listDebtPaymentRecords,
} from "./debt.repository";
import { parseDebtId } from "./debt.validation";
import {
  parseDebtPaymentInput,
  type DebtPaymentInput,
} from "./payment.validation";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";

type DebtPaymentRecord = Awaited<ReturnType<typeof createDebtPaymentRecord>>;

export type DebtPaymentDto = Omit<
  NonNullable<DebtPaymentRecord>,
  "principalAmount" | "interestAmount"
> &
  Readonly<{
    principalAmount: string;
    interestAmount: string;
    totalAmount: string;
  }>;

function serializeDebtPayment(
  record: NonNullable<DebtPaymentRecord>,
): DebtPaymentDto {
  return {
    ...record,
    principalAmount: record.principalAmount.toString(),
    interestAmount: record.interestAmount.toString(),
    totalAmount: (record.principalAmount + record.interestAmount).toString(),
  };
}

export async function listDebtPayments(
  userId: string,
  debtId: unknown,
): Promise<readonly DebtPaymentDto[]> {
  const parsedDebtId = parseDebtId(debtId);
  const records = await listDebtPaymentRecords(userId, parsedDebtId);
  return records.map(serializeDebtPayment);
}

export async function recordDebtPayment(
  userId: string,
  debtId: unknown,
  input: unknown,
): Promise<DebtPaymentDto> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const parsedDebtId = parseDebtId(debtId);
  const paymentInput: DebtPaymentInput = parseDebtPaymentInput(input);
  return serializeDebtPayment(
    await createDebtPaymentRecord(userId, parsedDebtId, paymentInput),
  );
}
