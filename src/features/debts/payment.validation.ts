import { z } from "zod";
import { validateInput } from "@/lib/validation";

const maximumPostgresBigint = 9_223_372_036_854_775_807n;

const amountSchema = z
  .string()
  .regex(/^\d+$/, "Số tiền phải là số nguyên không âm.")
  .transform((value) => BigInt(value))
  .refine((value) => value <= maximumPostgresBigint, {
    message: "Số tiền vượt quá giới hạn lưu trữ.",
  });

const paymentDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Ngày không hợp lệ.");

export const debtPaymentInputSchema = z
  .object({
    period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    paidOn: paymentDateSchema,
    principalAmount: amountSchema,
    interestAmount: amountSchema,
  })
  .refine(
    ({ principalAmount, interestAmount }) =>
      principalAmount + interestAmount <= maximumPostgresBigint,
    {
      path: ["interestAmount"],
      message: "Tổng thanh toán vượt quá giới hạn lưu trữ.",
    },
  )
  .refine(
    ({ principalAmount, interestAmount }) =>
      principalAmount > 0n || interestAmount > 0n,
    {
      path: ["principalAmount"],
      message: "Tổng thanh toán phải lớn hơn 0.",
    },
  );

export type DebtPaymentInput = z.infer<typeof debtPaymentInputSchema>;

export function parseDebtPaymentInput(input: unknown): DebtPaymentInput {
  return validateInput(debtPaymentInputSchema, input);
}
