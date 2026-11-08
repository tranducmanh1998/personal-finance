"use server";

import { revalidatePath } from "next/cache";
import {
  backfillHistoricalAssetBalances,
  backfillHistoricalDebt,
  backfillHistoricalTransaction,
} from "@/features/history/backfill.service";
import { finalizeHistoricalBackfill as finalizeHistoryRange } from "@/features/history/history.service";
import { requireUserId } from "@/lib/dal";
import { DomainError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ActionState } from "@/features/shared/action-state";

function validationError(error: DomainError): ActionState {
  if (error.code === "CONFLICT") {
    return { error: "Kỳ đã chốt, không thể thay đổi dữ liệu." };
  }
  const fields = new Set(error.fields.map((field) => field.field));
  if (
    fields.has("occurredOn") ||
    fields.has("asOfDate") ||
    fields.has("balanceAsOf")
  ) {
    return { error: "Ngày phải hợp lệ và trước hôm nay." };
  }
  if (fields.has("categoryId")) {
    return { error: "Vui lòng chọn danh mục khớp với loại giao dịch." };
  }
  return { error: "Vui lòng kiểm tra lại dữ liệu nhập bổ sung." };
}

function readTransactionInput(formData: FormData) {
  return {
    categoryId: formData.get("categoryId"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    description: formData.get("description"),
  };
}

function readDebtInput(formData: FormData) {
  return {
    borrowerName: formData.get("borrowerName"),
    loanType: formData.get("loanType"),
    balanceAsOf: formData.get("balanceAsOf"),
    balanceAmount: formData.get("balanceAmount"),
    dueDate: formData.get("dueDate"),
    principalDuePerPeriod: formData.get("principalDuePerPeriod"),
    interestDuePerPeriod: formData.get("interestDuePerPeriod"),
    paymentDuePerPeriod: formData.get("paymentDuePerPeriod"),
    finalPeriod: formData.get("finalPeriod") || null,
  };
}

export async function createHistoricalTransactionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await backfillHistoricalTransaction(userId, readTransactionInput(formData));
    revalidatePath("/history");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: "Đã nhập bổ sung giao dịch." };
  } catch (error) {
    if (error instanceof DomainError) return validationError(error);
    logError("persistence_failed");
    return { error: "Không thể lưu giao dịch lúc này. Vui lòng thử lại." };
  }
}

export async function saveHistoricalAssetBalancesAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await backfillHistoricalAssetBalances(userId, {
      asOfDate: formData.get("asOfDate"),
      cash: formData.get("cash"),
      savingsDeposit: formData.get("savingsDeposit"),
      cashEquivalent: formData.get("cashEquivalent"),
    });
    revalidatePath("/history");
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return { success: "Đã nhập bổ sung số dư tài sản." };
  } catch (error) {
    if (error instanceof DomainError) return validationError(error);
    logError("persistence_failed");
    return { error: "Không thể lưu số dư lúc này. Vui lòng thử lại." };
  }
}

export async function createHistoricalDebtAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await backfillHistoricalDebt(userId, readDebtInput(formData));
    revalidatePath("/history");
    revalidatePath("/debts");
    revalidatePath("/dashboard");
    return { success: "Đã nhập bổ sung thông tin khoản nợ." };
  } catch (error) {
    if (error instanceof DomainError) return validationError(error);
    logError("persistence_failed");
    return { error: "Không thể lưu khoản nợ lúc này. Vui lòng thử lại." };
  }
}

export async function finalizeHistoricalBackfillAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  if (formData.get("confirmed") !== "yes") {
    return { error: "Xác nhận rõ trước khi chốt các tháng đã chọn." };
  }
  try {
    await finalizeHistoryRange(
      userId,
      formData.get("startMonth"),
      formData.get("endMonth"),
    );
    revalidatePath("/history");
    revalidatePath("/history/backfill");
    revalidatePath("/transactions");
    revalidatePath("/debts");
    revalidatePath("/assets");
    revalidatePath("/dashboard");
    return {
      success:
        "Đã chốt khoảng tháng đã chọn; các tháng thiếu sau đó được chốt bù theo thứ tự.",
    };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "CONFLICT") {
        return { error: "Quy trình nhập lịch sử đã hoàn tất trước đó." };
      }
      return {
        error: "Khoảng tháng không hợp lệ hoặc có tháng chưa kết thúc.",
      };
    }
    logError("persistence_failed");
    return { error: "Không thể chốt lịch sử lúc này. Vui lòng thử lại." };
  }
}
