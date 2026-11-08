import { z } from "zod";
import { DomainError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { closeMissingMonthsThroughPreviousMonth } from "@/features/history/history.service";
import {
  createUserCategory,
  deleteUserCategory,
  ensureOtherCategories,
  listUserCategories,
  selectMonthlySavingsCategory,
} from "./category.repository";

const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    kind: z.enum(["income", "expense"]),
    isMonthlySavings: z.boolean(),
  })
  .refine(
    (input) => !input.isMonthlySavings || input.kind === "expense",
    "Chỉ danh mục chi tiêu mới có thể đánh dấu tiết kiệm.",
  );

const categoryIdSchema = z.string().uuid();

export type CategoryInput = z.infer<typeof categoryInputSchema>;
export type CategoryDto = Awaited<
  ReturnType<typeof listUserCategories>
>[number];

export async function ensureCategoryDefaults(userId: string): Promise<void> {
  await ensureOtherCategories(userId);
}

export async function listCategories(
  userId: string,
): Promise<readonly CategoryDto[]> {
  await ensureCategoryDefaults(userId);
  return listUserCategories(userId);
}

export async function createCategory(
  userId: string,
  input: unknown,
): Promise<void> {
  const parsedInput = validateInput(categoryInputSchema, input);
  await createUserCategory(userId, parsedInput);
}

export async function setMonthlySavingsCategory(
  userId: string,
  categoryId: unknown,
): Promise<void> {
  const parsedCategoryId = validateInput(categoryIdSchema, categoryId);
  const updated = await selectMonthlySavingsCategory(userId, parsedCategoryId);
  if (!updated) {
    throw new DomainError("NOT_FOUND");
  }
}

export async function deleteCategory(
  userId: string,
  categoryId: unknown,
): Promise<void> {
  await closeMissingMonthsThroughPreviousMonth(userId);
  const parsedCategoryId = validateInput(categoryIdSchema, categoryId);
  const deleted = await deleteUserCategory(userId, parsedCategoryId);
  if (!deleted) {
    throw new DomainError("NOT_FOUND");
  }
}
