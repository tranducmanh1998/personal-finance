"use server";

import { revalidatePath } from "next/cache";
import { requireUserId } from "@/lib/dal";
import { DomainError } from "@/lib/errors";
import { logError } from "@/lib/logger";
import type { ActionState } from "@/features/shared/action-state";
import {
  createCategory,
  deleteCategory,
  ensureCategoryDefaults,
  setMonthlySavingsCategory,
} from "@/features/categories/category.service";

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "23505"
  );
}

function reportPersistenceError(error: unknown): ActionState {
  if (error instanceof DomainError) {
    if (error.code === "CONFLICT") {
      return {
        error:
          error.fields[0]?.message ??
          "Danh mục đang được sử dụng và không thể thay đổi.",
      };
    }
    if (error.code === "NOT_FOUND") {
      return { error: "Không tìm thấy danh mục hoặc bạn không có quyền." };
    }
    if (error.code === "INVALID_INPUT") {
      return {
        error:
          error.fields[0]?.message ??
          "Vui lòng kiểm tra lại thông tin danh mục.",
      };
    }
  }
  if (isUniqueViolation(error)) {
    return { error: "Danh mục cùng tên đã tồn tại cho loại giao dịch này." };
  }
  logError("persistence_failed");
  return { error: "Không thể lưu danh mục lúc này. Vui lòng thử lại." };
}

export async function createCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await createCategory(userId, {
      name: formData.get("name"),
      kind: formData.get("kind"),
      isMonthlySavings: formData.get("isMonthlySavings") === "on",
    });
    revalidatePath("/categories");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: "Đã tạo danh mục." };
  } catch (error) {
    return reportPersistenceError(error);
  }
}

export async function setMonthlySavingsCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await setMonthlySavingsCategory(userId, formData.get("categoryId"));
    revalidatePath("/categories");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: "Đã cập nhật danh mục tiết kiệm tháng." };
  } catch (error) {
    return reportPersistenceError(error);
  }
}

export async function createOtherCategoriesAction(): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await ensureCategoryDefaults(userId);
    revalidatePath("/categories");
    revalidatePath("/transactions");
    return { success: "Đã bảo đảm có danh mục Khác cho thu và chi." };
  } catch (error) {
    return reportPersistenceError(error);
  }
}

export async function deleteCategoryAction(
  _previousState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const userId = await requireUserId();
  try {
    await deleteCategory(userId, formData.get("categoryId"));
    revalidatePath("/categories");
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    return { success: "Đã xóa danh mục." };
  } catch (error) {
    return reportPersistenceError(error);
  }
}
