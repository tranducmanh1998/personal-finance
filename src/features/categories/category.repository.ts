import { and, asc, eq } from "drizzle-orm";
import { getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { transaction } from "@/db/schema/finance";
import { DomainError } from "@/lib/errors";

export async function listUserCategories(userId: string) {
  return getDb()
    .select({
      id: category.id,
      name: category.name,
      kind: category.kind,
      isMonthlySavings: category.isMonthlySavings,
    })
    .from(category)
    .where(eq(category.userId, userId))
    .orderBy(asc(category.kind), asc(category.name));
}

export async function createUserCategory(
  userId: string,
  values: Readonly<{
    name: string;
    kind: "income" | "expense";
    isMonthlySavings: boolean;
  }>,
  db: Database = getDb(),
): Promise<void> {
  await db.transaction(async (tx) => {
    if (values.isMonthlySavings) {
      await tx
        .update(category)
        .set({ isMonthlySavings: false, updatedAt: new Date() })
        .where(
          and(
            eq(category.userId, userId),
            eq(category.kind, "expense"),
            eq(category.isMonthlySavings, true),
          ),
        );
    }
    await tx.insert(category).values({ userId, ...values });
  });
}

export async function selectMonthlySavingsCategory(
  userId: string,
  categoryId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    await tx
      .update(category)
      .set({ isMonthlySavings: false, updatedAt: new Date() })
      .where(
        and(
          eq(category.userId, userId),
          eq(category.kind, "expense"),
          eq(category.isMonthlySavings, true),
        ),
      );
    const updated = await tx
      .update(category)
      .set({ isMonthlySavings: true, updatedAt: new Date() })
      .where(
        and(
          eq(category.id, categoryId),
          eq(category.userId, userId),
          eq(category.kind, "expense"),
        ),
      )
      .returning({ id: category.id });
    if (updated.length === 0) {
      throw new DomainError("NOT_FOUND");
    }
    return true;
  });
}

export async function ensureOtherCategories(
  userId: string,
  db: Database = getDb(),
): Promise<void> {
  await db
    .insert(category)
    .values([
      { userId, name: "Khác", kind: "income" },
      { userId, name: "Khác", kind: "expense" },
    ])
    .onConflictDoNothing({
      target: [category.userId, category.kind, category.name],
    });
}

export async function deleteUserCategory(
  userId: string,
  categoryId: string,
  db: Database = getDb(),
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ownedCategory] = await tx
      .select({
        id: category.id,
        name: category.name,
      })
      .from(category)
      .where(and(eq(category.id, categoryId), eq(category.userId, userId)))
      .for("update")
      .limit(1);
    if (!ownedCategory) {
      return false;
    }

    if (ownedCategory.name === "Khác") {
      throw new DomainError("CONFLICT", [
        {
          field: "categoryId",
          message: "Không thể xóa danh mục “Khác” mặc định.",
        },
      ]);
    }

    const [referencedTransaction] = await tx
      .select({ id: transaction.id })
      .from(transaction)
      .where(
        and(
          eq(transaction.categoryId, categoryId),
          eq(transaction.userId, userId),
        ),
      )
      .limit(1);
    if (referencedTransaction) {
      throw new DomainError("CONFLICT", [
        {
          field: "categoryId",
          message:
            "Không thể xóa danh mục vì đang có giao dịch sử dụng danh mục này.",
        },
      ]);
    }

    const [deletedCategory] = await tx
      .delete(category)
      .where(and(eq(category.id, categoryId), eq(category.userId, userId)))
      .returning({ id: category.id });
    return Boolean(deletedCategory);
  });
}
