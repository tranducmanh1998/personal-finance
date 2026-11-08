import { z } from "zod";
import { validateInput } from "@/lib/validation";

const maximumPostgresBigint = 9_223_372_036_854_775_807n;

const debtAmountSchema = z
  .string()
  .regex(/^\d+$/, "Số tiền phải là số nguyên không âm.")
  .transform((value) => BigInt(value))
  .refine((value) => value <= maximumPostgresBigint, {
    message: "Số tiền vượt quá giới hạn lưu trữ.",
  });

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() > 0 &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Ngày không hợp lệ.");

export const debtInputSchema = z.object({
  borrowerName: z.string().trim().min(1),
  loanType: z.string().trim().min(1),
  balanceAsOf: dateSchema,
  balanceAmount: debtAmountSchema,
  dueDate: dateSchema,
  principalDuePerPeriod: debtAmountSchema,
  interestDuePerPeriod: debtAmountSchema,
  paymentDuePerPeriod: debtAmountSchema,
  finalPeriod: dateSchema
    .nullable()
    .optional()
    .transform((value) => value ?? null),
});

export type DebtInput = z.infer<typeof debtInputSchema>;

export function parseDebtInput(input: unknown): DebtInput {
  return validateInput(debtInputSchema, input);
}

export function parseDebtId(input: unknown): string {
  return validateInput(z.uuid(), input);
}
