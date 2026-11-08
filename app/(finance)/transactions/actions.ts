"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { requireUserId } from "@/lib/dal";
import { logError } from "@/lib/logger";
import type { ActionState } from "@/features/shared/action-state";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/features/transactions/transaction.service";

function readTransactionInput(formData: FormData) {
  return {
    categoryId: formData.get("categoryId"),
    kind: formData.get("kind"),
    amount: formData.get("amount"),
    occurredOn: formData.get("occurredOn"),
    description: formData.get("description"),
  };
}

function domainErrorMessage(error: DomainError): string {
  if (error.fields.some((field) => field.field === "month")) {
    return "Kỳ đã chốt, không thể thay đổi giao dịch.";
  }
  if (error.code === "NOT_FOUND") {
    return "Không tìm thấy giao dịch hoặc bạn không có quyền thực hiện.";
  }
  if (error.code === "CONFLICT") {
    return "Giao dịch liên kết thanh toán nợ chỉ được xem tại đây.";
  }

  const fields = new Set(error.fields.map((field) => field.field));
  if (fields.has("amount")) return "Số tiền phải là số nguyên có dấu hợp lệ.";
  if (fields.has("occurredOn")) return "Ngày giao dịch không hợp lệ.";
  if (fields.has("kind")) return "Vui lòng chọn loại giao dịch hợp lệ.";
  if (fields.has("categoryId")) {
    return "Vui lòng chọn danh mục khớp với loại giao dịch.";
  }
  if (fields.has("description")) return "Mô tả không được vượt quá 500 ký tự.";
  return "Vui lòng kiểm tra lại thông tin giao dịch.";
}

function persistenceError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    return { error: domainErrorMessage(error) };
  }
  logError("persistence_failed");
  return { error: "Không thể lưu giao dịch lúc này. Vui lòng thử lại." };
}

export async function createTransactionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await createTransaction(userId, readTransactionInput(formData));
    revalidatePath("/transactions");
    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return { success: "Đã thêm giao dịch." };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function updateTransactionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await updateTransaction(
      userId,
      formData.get("transactionId"),
      readTransactionInput(formData),
    );
    revalidatePath("/transactions");
    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return { success: "Đã cập nhật giao dịch." };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function deleteTransactionAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await deleteTransaction(userId, formData.get("transactionId"));
    revalidatePath("/transactions");
    revalidatePath("/goals");
    revalidatePath("/dashboard");
    return { success: "Đã xóa giao dịch." };
  } catch (error) {
    return persistenceError(error);
  }
}
