"use server";

import { revalidatePath } from "next/cache";
import { DomainError } from "@/lib/errors";
import { requireUserId } from "@/lib/dal";
import { logError } from "@/lib/logger";
import type { ActionState } from "@/features/shared/action-state";
import {
  createGoal,
  setGoalTransactionLink,
  updateGoal,
} from "@/features/goals/goal.service";

function errorState(error: unknown): ActionState {
  if (error instanceof DomainError) {
    if (error.code === "NOT_FOUND") {
      return {
        error:
          error.fields[0]?.message ??
          "Không tìm thấy mục tiêu hoặc giao dịch thuộc tài khoản của bạn.",
      };
    }
    if (error.code === "CONFLICT") {
      return {
        error:
          error.fields[0]?.message ??
          "Không thể liên kết giao dịch này với mục tiêu.",
      };
    }
    if (error.code === "INVALID_INPUT") {
      const field = error.fields[0]?.field;
      if (field === "targetAmount") {
        return { error: "Số tiền mục tiêu phải là số nguyên không âm hợp lệ." };
      }
      if (field === "targetDate") {
        return { error: "Ngày mục tiêu không hợp lệ." };
      }
      if (field === "name") {
        return { error: "Tên mục tiêu là bắt buộc và tối đa 100 ký tự." };
      }
      return {
        error:
          error.fields[0]?.message ??
          "Vui lòng kiểm tra lại thông tin mục tiêu.",
      };
    }
  }
  logError("persistence_failed");
  return { error: "Không thể lưu mục tiêu lúc này. Vui lòng thử lại." };
}

function readGoalInput(formData: FormData) {
  return {
    name: formData.get("name"),
    targetAmount: formData.get("targetAmount"),
    targetDate: formData.get("targetDate"),
  };
}

export async function createGoalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await createGoal(userId, readGoalInput(formData));
    revalidatePath("/goals");
    return { success: "Đã tạo mục tiêu tiết kiệm." };
  } catch (error) {
    return errorState(error);
  }
}

export async function updateGoalAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await updateGoal(userId, formData.get("goalId"), readGoalInput(formData));
    revalidatePath("/goals");
    return { success: "Đã cập nhật mục tiêu." };
  } catch (error) {
    return errorState(error);
  }
}

export async function setGoalTransactionLinkAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    const linked = formData.get("linked");
    if (linked !== "true" && linked !== "false") {
      return { error: "Trạng thái liên kết giao dịch không hợp lệ." };
    }
    await setGoalTransactionLink(
      userId,
      formData.get("goalId"),
      formData.get("transactionId"),
      linked === "true",
    );
    revalidatePath("/goals");
    return {
      success: linked === "true" ? "Đã liên kết giao dịch." : "Đã bỏ liên kết.",
    };
  } catch (error) {
    return errorState(error);
  }
}
