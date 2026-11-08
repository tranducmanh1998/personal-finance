"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import { requireUserId } from "@/lib/dal";
import { validateInput } from "@/lib/validation";
import type { ActionState } from "@/features/shared/action-state";
import { saveAssetBalances as persistAssetBalances } from "@/features/assets/asset.repository";

const maximumBigint = 9_223_372_036_854_775_807n;
const balanceSchema = z
  .string()
  .regex(/^\d+$/, "Nhập số nguyên không âm.")
  .refine((value) => BigInt(value) <= maximumBigint, "Số tiền vượt giới hạn.");

const formSchema = z.object({
  asOfDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .refine((value) => {
      const date = new Date(`${value}T00:00:00.000Z`);
      return (
        !Number.isNaN(date.valueOf()) &&
        date.toISOString().slice(0, 10) === value
      );
    }),
  cash: balanceSchema,
  savingsDeposit: balanceSchema,
  cashEquivalent: balanceSchema,
});

export async function saveAssetBalances(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  let values: z.infer<typeof formSchema>;
  try {
    values = validateInput(formSchema, {
      asOfDate: formData.get("asOfDate"),
      cash: formData.get("cash"),
      savingsDeposit: formData.get("savingsDeposit"),
      cashEquivalent: formData.get("cashEquivalent"),
    });
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        error: "Vui lòng nhập ngày và số dư hợp lệ cho cả ba loại tài sản.",
      };
    }
    logError("unexpected_error");
    return { error: "Không thể lưu số dư lúc này. Vui lòng thử lại." };
  }

  const userId = await requireUserId();
  try {
    await persistAssetBalances(userId, values.asOfDate, [
      { kind: "cash", amount: BigInt(values.cash) },
      {
        kind: "savings_deposit",
        amount: BigInt(values.savingsDeposit),
      },
      {
        kind: "cash_equivalent",
        amount: BigInt(values.cashEquivalent),
      },
    ]);
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return { success: "Đã lưu số dư tài sản." };
  } catch (error) {
    if (error instanceof DomainError) {
      return {
        error: error.fields.some((field) => field.field === "month")
          ? "Kỳ đã chốt, không thể thay đổi số dư tài sản."
          : "Vui lòng kiểm tra lại số dư tài sản.",
      };
    }
    logError("persistence_failed");
    return { error: "Không thể lưu số dư lúc này. Vui lòng thử lại." };
  }
}
