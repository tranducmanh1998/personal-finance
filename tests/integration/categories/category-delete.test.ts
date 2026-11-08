import "dotenv/config";
import { randomUUID } from "node:crypto";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { transaction } from "@/db/schema/finance";
import { user } from "@/db/schema/auth";
import {
  createCategory,
  deleteCategory,
  listCategories,
  setMonthlySavingsCategory,
} from "@/features/categories/category.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;

let db: Database;
let ownerId: string;
let otherOwnerId: string;
let originalDatabaseUrl: string | undefined;

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function ensureIsolatedTestDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required for category integration tests.",
    );
  }
  const test = new URL(testDatabaseUrl);
  const application = new URL(applicationDatabaseUrl);
  if (!databaseName(test).endsWith("_test")) {
    throw new Error(
      "TEST_DATABASE_URL must identify a database ending in _test.",
    );
  }
  if (
    test.hostname.toLowerCase() === application.hostname.toLowerCase() &&
    (test.port || "5432") === (application.port || "5432") &&
    databaseName(test) === databaseName(application)
  ) {
    throw new Error(
      "Refusing to run category integration tests against the application database.",
    );
  }
}

describe("category PostgreSQL integration", () => {
  beforeAll(async () => {
    ensureIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    ownerId = `fake-category-owner-${randomUUID()}`;
    otherOwnerId = `fake-category-other-${randomUUID()}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Category Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Other Category Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  }, 60_000);

  afterAll(async () => {
    if (db && ownerId && otherOwnerId) {
      await db
        .delete(transaction)
        .where(
          or(
            eq(transaction.userId, ownerId),
            eq(transaction.userId, otherOwnerId),
          ),
        );
      await db
        .delete(category)
        .where(
          or(eq(category.userId, ownerId), eq(category.userId, otherOwnerId)),
        );
      await db
        .delete(user)
        .where(or(eq(user.id, ownerId), eq(user.id, otherOwnerId)));
      await closeDb();
    }
    if (originalDatabaseUrl) {
      process.env.DATABASE_URL = originalDatabaseUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
  });

  it("creates and lists owned categories, protects defaults and referenced records", async () => {
    await createCategory(ownerId, {
      name: "Chi phí giả lập",
      kind: "expense",
      isMonthlySavings: false,
    });
    await createCategory(otherOwnerId, {
      name: "Danh mục riêng giả lập",
      kind: "income",
      isMonthlySavings: false,
    });
    await expect(
      createCategory(ownerId, {
        name: "Tiết kiệm sai loại",
        kind: "income",
        isMonthlySavings: true,
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    await createCategory(ownerId, {
      name: "Tiết kiệm tháng giả lập",
      kind: "expense",
      isMonthlySavings: true,
    });
    const savingsCategories = await listCategories(ownerId);
    const incomeOther = savingsCategories.find(
      (item) => item.name === "Khác" && item.kind === "income",
    );
    const expenseOther = savingsCategories.find(
      (item) => item.name === "Khác" && item.kind === "expense",
    );
    if (!incomeOther || !expenseOther) {
      throw new Error("The income and expense Khác categories are required.");
    }
    expect(incomeOther.id).not.toBe(expenseOther.id);
    expect(
      savingsCategories.some((item) => item.name === "Danh mục riêng giả lập"),
    ).toBe(false);
    expect(
      savingsCategories.find((item) => item.name === "Tiết kiệm tháng giả lập"),
    ).toMatchObject({ kind: "expense", isMonthlySavings: true });

    const priorSavings = savingsCategories.find(
      (item) => item.name === "Chi phí giả lập",
    );
    expect(priorSavings?.isMonthlySavings).toBe(false);
    await setMonthlySavingsCategory(ownerId, priorSavings?.id);
    expect(
      (await listCategories(ownerId)).find(
        (item) => item.name === "Chi phí giả lập",
      )?.isMonthlySavings,
    ).toBe(true);

    const [referencedCategory] = await db
      .select()
      .from(category)
      .where(
        and(eq(category.userId, ownerId), eq(category.name, "Chi phí giả lập")),
      );
    if (!referencedCategory) {
      throw new Error("The test category was not created.");
    }
    const [savedTransaction] = await db
      .insert(transaction)
      .values({
        userId: ownerId,
        categoryId: referencedCategory.id,
        kind: "expense",
        amount: 125n,
        occurredOn: new Date().toISOString().slice(0, 10),
        description: "Giao dịch bảo vệ giả lập",
      })
      .returning();
    if (!savedTransaction) {
      throw new Error("The test transaction was not created.");
    }

    await expect(
      deleteCategory(ownerId, referencedCategory.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      fields: [
        {
          field: "categoryId",
          message:
            "Không thể xóa danh mục vì đang có giao dịch sử dụng danh mục này.",
        },
      ],
    });
    await expect(
      deleteCategory(otherOwnerId, referencedCategory.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(deleteCategory(ownerId, incomeOther.id)).rejects.toMatchObject(
      {
        code: "CONFLICT",
      },
    );
    await expect(deleteCategory(ownerId, randomUUID())).rejects.toMatchObject({
      code: "NOT_FOUND",
    });

    const [preservedTransaction] = await db
      .select()
      .from(transaction)
      .where(eq(transaction.id, savedTransaction.id));
    expect(preservedTransaction).toBeDefined();
    expect(
      (await listCategories(ownerId)).some(
        (item) => item.id === referencedCategory.id,
      ),
    ).toBe(true);

    const removable = savingsCategories.find(
      (item) => item.name === "Tiết kiệm tháng giả lập",
    );
    if (!removable) {
      throw new Error("The removable test category was not created.");
    }
    await deleteCategory(ownerId, removable.id);
    expect(
      (await listCategories(ownerId)).some((item) => item.id === removable.id),
    ).toBe(false);
  });
});
