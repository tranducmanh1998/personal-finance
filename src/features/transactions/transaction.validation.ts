import { z } from "zod";
import { validateInput } from "@/lib/validation";

const minimumPostgresBigint = -9_223_372_036_854_775_808n;
const maximumPostgresBigint = 9_223_372_036_854_775_807n;

const amountSchema = z
  .string()
  .regex(/^-?\d+$/, "Số tiền phải là số nguyên có dấu.")
  .transform((value) => BigInt(value))
  .refine(
    (value) => value >= minimumPostgresBigint && value <= maximumPostgresBigint,
    { message: "Số tiền vượt quá giới hạn lưu trữ." },
  );

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

const categoryIdSchema = z
  .union([z.uuid(), z.literal(""), z.null(), z.undefined()])
  .transform((value) => (typeof value === "string" && value ? value : null));

export const transactionInputSchema = z.object({
  categoryId: categoryIdSchema,
  kind: z.enum(["income", "expense"]),
  amount: amountSchema,
  occurredOn: dateSchema,
  description: z
    .string()
    .trim()
    .max(500, "Mô tả không được vượt quá 500 ký tự.")
    .nullable()
    .optional()
    .transform((value) => value || null),
});

export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type ResolvedTransactionInput = Omit<TransactionInput, "categoryId"> &
  Readonly<{ categoryId: string }>;

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Tháng phải theo định dạng YYYY-MM.")
  .refine((value) => Number(value.slice(0, 4)) > 0, "Tháng không hợp lệ.");

export function parseTransactionInput(input: unknown): TransactionInput {
  return validateInput(transactionInputSchema, input);
}

export function parseTransactionId(input: unknown): string {
  return validateInput(z.uuid(), input);
}

export function parseTransactionMonth(input: unknown): string {
  return validateInput(monthSchema, input);
}
