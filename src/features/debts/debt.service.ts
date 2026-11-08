import { DomainError } from "@/lib/errors";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";
import {
  createDebtRecord,
  deleteDebtRecord,
  getDebtRecord,
  listDebtRecords,
  updateDebtRecord,
} from "./debt.repository";
import { parseDebtId, parseDebtInput, type DebtInput } from "./debt.validation";

type DebtRecord = Awaited<ReturnType<typeof createDebtRecord>>;

export type DebtDto = Omit<
  NonNullable<DebtRecord>,
  | "balanceAmount"
  | "principalDuePerPeriod"
  | "interestDuePerPeriod"
  | "paymentDuePerPeriod"
> &
  Readonly<{
    balanceAmount: string;
    principalDuePerPeriod: string;
    interestDuePerPeriod: string;
    paymentDuePerPeriod: string;
  }>;

function serializeDebt(record: NonNullable<DebtRecord>): DebtDto {
  return {
    ...record,
    balanceAmount: record.balanceAmount.toString(),
    principalDuePerPeriod: record.principalDuePerPeriod.toString(),
    interestDuePerPeriod: record.interestDuePerPeriod.toString(),
    paymentDuePerPeriod: record.paymentDuePerPeriod.toString(),
  };
}

export async function getDebt(
  userId: string,
  debtId: unknown,
): Promise<DebtDto | null> {
  const record = await getDebtRecord(userId, parseDebtId(debtId));
  return record ? serializeDebt(record) : null;
}

export async function createDebt(
  userId: string,
  input: unknown,
): Promise<DebtDto> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const debtInput: DebtInput = parseDebtInput(input);
  return serializeDebt(await createDebtRecord(userId, debtInput));
}

export async function listDebts(userId: string): Promise<readonly DebtDto[]> {
  const records = await listDebtRecords(userId);
  return records.map(serializeDebt);
}

export async function updateDebt(
  userId: string,
  debtId: unknown,
  input: unknown,
): Promise<DebtDto> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const updated = await updateDebtRecord(
    userId,
    parseDebtId(debtId),
    parseDebtInput(input),
  );
  if (!updated) {
    throw new DomainError("NOT_FOUND");
  }
  return serializeDebt(updated);
}

export async function deleteDebt(
  userId: string,
  debtId: unknown,
): Promise<void> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const deleted = await deleteDebtRecord(userId, parseDebtId(debtId));
  if (!deleted) {
    throw new DomainError("NOT_FOUND");
  }
}
