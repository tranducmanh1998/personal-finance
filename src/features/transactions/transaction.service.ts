import { DomainError } from "@/lib/errors";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";
import {
  createTransactionRecord,
  deleteTransactionRecord,
  getTransactionRecord,
  listCurrentMonthTransactionRecords,
  resolveTransactionCategoryId,
  updateTransactionRecord,
} from "./transaction.repository";
import {
  parseTransactionId,
  parseTransactionInput,
  parseTransactionMonth,
  type ResolvedTransactionInput,
  type TransactionInput,
} from "./transaction.validation";

type TransactionRecord = Awaited<ReturnType<typeof createTransactionRecord>>;
type TransactionRecordWithPayment = NonNullable<TransactionRecord> &
  Readonly<{ isDebtPayment?: boolean }>;

export type TransactionDto = Omit<NonNullable<TransactionRecord>, "amount"> &
  Readonly<{ amount: string; isDebtPayment: boolean }>;

function serializeTransaction(
  record: TransactionRecordWithPayment,
  isDebtPayment = false,
): TransactionDto {
  return {
    ...record,
    amount: record.amount.toString(),
    isDebtPayment: record.isDebtPayment ?? isDebtPayment,
  };
}

async function resolveInputCategory(
  userId: string,
  input: TransactionInput,
): Promise<ResolvedTransactionInput> {
  const categoryId = await resolveTransactionCategoryId(
    userId,
    input.categoryId,
    input.kind,
  );
  if (!categoryId) {
    throw new DomainError("INVALID_INPUT", [
      {
        field: "categoryId",
        message: "Danh mục phải thuộc tài khoản và khớp loại giao dịch.",
      },
    ]);
  }
  return { ...input, categoryId };
}

export async function createTransaction(
  userId: string,
  input: unknown,
): Promise<TransactionDto> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const parsedInput = parseTransactionInput(input);
  const resolvedInput = await resolveInputCategory(userId, parsedInput);
  return serializeTransaction(
    await createTransactionRecord(userId, resolvedInput),
  );
}

export async function getTransaction(
  userId: string,
  transactionId: unknown,
): Promise<TransactionDto> {
  const record = await getTransactionRecord(
    userId,
    parseTransactionId(transactionId),
  );
  if (!record) {
    throw new DomainError("NOT_FOUND");
  }
  return serializeTransaction(record, record.isDebtPayment);
}

function currentMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export async function listCurrentMonthTransactions(
  userId: string,
): Promise<readonly TransactionDto[]> {
  const records = await listCurrentMonthTransactionRecords(
    userId,
    parseTransactionMonth(currentMonth()),
  );
  return records.map((record) =>
    serializeTransaction(record, record.isDebtPayment),
  );
}

export async function listTransactionsForMonth(
  userId: string,
  month: unknown,
): Promise<readonly TransactionDto[]> {
  const records = await listCurrentMonthTransactionRecords(
    userId,
    parseTransactionMonth(month),
  );
  return records.map((record) =>
    serializeTransaction(record, record.isDebtPayment),
  );
}

export async function updateTransaction(
  userId: string,
  transactionId: unknown,
  input: unknown,
): Promise<TransactionDto> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const parsedId = parseTransactionId(transactionId);
  const existing = await getTransactionRecord(userId, parsedId);
  if (!existing) {
    throw new DomainError("NOT_FOUND");
  }

  const parsedInput = parseTransactionInput(input);
  const resolvedInput = await resolveInputCategory(userId, parsedInput);
  const updated = await updateTransactionRecord(
    userId,
    parsedId,
    resolvedInput,
  );
  if (!updated) {
    throw new DomainError("NOT_FOUND");
  }
  return serializeTransaction(updated);
}

export async function deleteTransaction(
  userId: string,
  transactionId: unknown,
): Promise<void> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const deleted = await deleteTransactionRecord(
    userId,
    parseTransactionId(transactionId),
  );
  if (!deleted) {
    throw new DomainError("NOT_FOUND");
  }
}
