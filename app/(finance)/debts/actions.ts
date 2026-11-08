"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/dal";
import { DomainError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ActionState } from "@/features/shared/action-state";
import {
  createDebt,
  deleteDebt,
  updateDebt,
} from "@/features/debts/debt.service";
import { recordDebtPayment } from "@/features/debts/payment.service";
import { parseDebtId } from "@/features/debts/debt.validation";

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

function validationMessage(error: DomainError): string {
  const fields = new Set(error.fields.map((field) => field.field));
  if (fields.has("month")) {
    return "Kỳ đã chốt, không thể thay đổi dữ liệu thuộc tháng đó.";
  }
  if (fields.has("borrowerName")) return "Vui lòng nhập tên người vay.";
  if (fields.has("loanType")) return "Vui lòng nhập loại vay.";
  if (fields.has("balanceAsOf")) return "Ngày chốt dư nợ không hợp lệ.";
  if (fields.has("balanceAmount"))
    return "Dư nợ phải là số nguyên không âm hợp lệ.";
  if (fields.has("dueDate")) return "Ngày đến hạn không hợp lệ.";
  if (
    fields.has("principalDuePerPeriod") ||
    fields.has("interestDuePerPeriod") ||
    fields.has("paymentDuePerPeriod")
  ) {
    return "Các khoản phải trả cần là số nguyên không âm hợp lệ.";
  }
  if (fields.has("finalPeriod")) return "Kỳ cuối cùng không hợp lệ.";
  return "Vui lòng kiểm tra lại thông tin khoản nợ.";
}

function persistenceError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    return { error: validationMessage(error) };
  }
  logError("persistence_failed");
  return { error: "Không thể lưu khoản nợ lúc này. Vui lòng thử lại." };
}

export async function createDebtAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await createDebt(userId, readDebtInput(formData));
    revalidatePath("/debts");
    revalidatePath("/dashboard");
    return { success: "Đã thêm khoản nợ." };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function updateDebtAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    const debtId = parseDebtId(formData.get("debtId"));
    await updateDebt(userId, debtId, readDebtInput(formData));
    revalidatePath("/debts");
    revalidatePath("/dashboard");
    return { success: "Đã cập nhật khoản nợ." };
  } catch (error) {
    return persistenceError(error);
  }
}

export async function deleteDebtAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    const debtId = parseDebtId(formData.get("debtId"));
    await deleteDebt(userId, debtId);
    revalidatePath("/debts");
    revalidatePath("/dashboard");
    return { success: "Đã xóa khoản nợ khỏi danh sách theo dõi." };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.code === "CONFLICT") {
        return { error: "Chỉ có thể xóa khoản nợ đã tất toán." };
      }
      if (error.code === "NOT_FOUND") {
        return { error: "Không tìm thấy khoản nợ cần xóa." };
      }
      return { error: "Vui lòng kiểm tra lại khoản nợ cần xóa." };
    }
    logError("persistence_failed");
    return { error: "Không thể xóa khoản nợ lúc này. Vui lòng thử lại." };
  }
}

export async function recordDebtPaymentAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  const debtId = formData.get("debtId");
  try {
    await recordDebtPayment(userId, debtId, {
      period: formData.get("period"),
      paidOn: formData.get("paidOn"),
      principalAmount: formData.get("principalAmount"),
      interestAmount: formData.get("interestAmount"),
    });
    revalidatePath("/debts");
    revalidatePath(`/debts/${String(debtId)}/payments`);
    revalidatePath("/dashboard");
    return { success: "Đã ghi nhận thanh toán." };
  } catch (error) {
    if (error instanceof DomainError) {
      if (error.fields.some((field) => field.field === "month")) {
        return { error: "Kỳ đã chốt, không thể ghi nhận thanh toán." };
      }
      const field = error.fields[0]?.field;
      if (field === "period" && error.code === "CONFLICT") {
        return { error: "Kỳ này đã được ghi nhận thanh toán." };
      }
      if (field === "principalAmount") {
        return { error: "Tiền gốc phải hợp lệ và không vượt quá dư nợ." };
      }
      return { error: "Vui lòng kiểm tra lại thông tin thanh toán." };
    }
    logError("persistence_failed");
    return { error: "Không thể lưu thanh toán lúc này. Vui lòng thử lại." };
  }
}
