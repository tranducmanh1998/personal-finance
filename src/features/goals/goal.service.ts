import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import {
  createGoalRecord,
  getGoalRecord,
  listGoalRecords,
  listGoalTransactionIds,
  listLinkableTransactionRecords,
  setGoalTransactionRecord,
  updateGoalRecord,
} from "./goal.repository";

const minimumPostgresBigint = 0n;
const maximumPostgresBigint = 9_223_372_036_854_775_807n;

const goalInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  targetAmount: z
    .string()
    .regex(/^\d+$/, "Số tiền mục tiêu phải là số nguyên không âm.")
    .transform(BigInt)
    .refine(
      (amount) =>
        amount >= minimumPostgresBigint && amount <= maximumPostgresBigint,
      "Số tiền mục tiêu vượt quá giới hạn lưu trữ.",
    ),
  targetDate: z
    .union([z.iso.date(), z.literal(""), z.null(), z.undefined()])
    .transform((value) => (typeof value === "string" && value ? value : null)),
});

const goalIdSchema = z.uuid();
const transactionIdSchema = z.uuid();

export type GoalInput = Readonly<{
  name: string;
  targetAmount: string;
  targetDate?: string | null;
}>;

export type GoalProgress = Readonly<{
  progress: string;
  remaining: string;
  isComplete: boolean;
}>;

export type GoalDto = Omit<
  Awaited<ReturnType<typeof listGoalRecords>>[number],
  "targetAmount"
> &
  Readonly<{ targetAmount: string; remaining: string; isComplete: boolean }>;

export type LinkableTransaction = Omit<
  Awaited<ReturnType<typeof listLinkableTransactionRecords>>[number],
  "amount"
> &
  Readonly<{ amount: string; linked: boolean }>;

export function calculateGoalProgress(
  targetAmountInput: string,
  contributionAmounts: readonly string[],
): GoalProgress {
  const targetAmount = BigInt(targetAmountInput);
  const progress = contributionAmounts.reduce(
    (total, amount) => total + BigInt(amount),
    0n,
  );
  return {
    progress: progress.toString(),
    remaining: (targetAmount > progress
      ? targetAmount - progress
      : 0n
    ).toString(),
    isComplete: progress >= targetAmount,
  };
}

function parseGoalInput(input: unknown) {
  return validateInput(goalInputSchema, input);
}

export async function createGoal(
  userId: string,
  input: unknown,
): Promise<void> {
  const parsedInput = parseGoalInput(input);
  await createGoalRecord(userId, parsedInput);
}

export async function listGoals(userId: string): Promise<readonly GoalDto[]> {
  const records = await listGoalRecords(userId);
  return records.map((record) => {
    const progress = BigInt(record.progress);
    return {
      ...record,
      targetAmount: record.targetAmount.toString(),
      remaining:
        record.targetAmount > progress
          ? (record.targetAmount - progress).toString()
          : "0",
      isComplete: progress >= record.targetAmount,
    };
  });
}

export async function updateGoal(
  userId: string,
  goalIdInput: unknown,
  input: unknown,
): Promise<void> {
  const goalId = validateInput(goalIdSchema, goalIdInput);
  const parsedInput = parseGoalInput(input);
  const updated = await updateGoalRecord(userId, goalId, parsedInput);
  if (!updated) {
    throw new DomainError("NOT_FOUND");
  }
}

export async function listGoalTransactions(
  userId: string,
  goalIdInput: unknown,
): Promise<readonly LinkableTransaction[]> {
  const goalId = validateInput(goalIdSchema, goalIdInput);
  if (!(await getGoalRecord(userId, goalId))) {
    throw new DomainError("NOT_FOUND");
  }
  const [transactions, linkedIds] = await Promise.all([
    listLinkableTransactionRecords(userId),
    listGoalTransactionIds(userId, goalId),
  ]);
  const linkedIdSet = new Set(linkedIds);
  return transactions.map((item) => ({
    ...item,
    amount: item.amount.toString(),
    linked: linkedIdSet.has(item.id),
  }));
}

export async function setGoalTransactionLink(
  userId: string,
  goalIdInput: unknown,
  transactionIdInput: unknown,
  linked: boolean,
): Promise<void> {
  const goalId = validateInput(goalIdSchema, goalIdInput);
  const transactionId = validateInput(transactionIdSchema, transactionIdInput);
  if (typeof linked !== "boolean") {
    throw new DomainError("INVALID_INPUT", [
      { field: "linked", message: "Trạng thái liên kết không hợp lệ." },
    ]);
  }
  await setGoalTransactionRecord(userId, goalId, transactionId, linked);
}
