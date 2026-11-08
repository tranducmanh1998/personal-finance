import "dotenv/config";
import { randomUUID } from "node:crypto";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { category } from "@/db/schema/categories";
import { goal, goalTransaction } from "@/db/schema/goals";
import { transaction } from "@/db/schema/finance";
import { user } from "@/db/schema/auth";
import { ensureOtherCategories } from "@/features/categories/category.repository";
import {
  createTransaction,
  deleteTransaction,
  updateTransaction,
} from "@/features/transactions/transaction.service";
import {
  createGoal,
  listGoalTransactions,
  listGoals,
  setGoalTransactionLink,
  updateGoal,
} from "@/features/goals/goal.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;

let db: Database;
let ownerId: string;
let otherOwnerId: string;
let incomeCategoryId: string;
let expenseCategoryId: string;
let otherOwnerCategoryId: string;
let originalDatabaseUrl: string | undefined;

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function ensureIsolatedTestDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required for goal integration tests.",
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
      "Refusing to run goal integration tests against the application database.",
    );
  }
}

describe("savings goal PostgreSQL integration", () => {
  beforeAll(async () => {
    ensureIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    ownerId = `fake-goal-owner-${randomUUID()}`;
    otherOwnerId = `fake-goal-other-${randomUUID()}`;
    const now = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Goal Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Other Goal Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    const [incomeCategory, expenseCategory, foreignCategory] = await db
      .insert(category)
      .values([
        { userId: ownerId, name: "Thu nhập giả lập", kind: "income" },
        { userId: ownerId, name: "Chi tiêu giả lập", kind: "expense" },
        { userId: otherOwnerId, name: "Riêng tư giả lập", kind: "income" },
      ])
      .returning();
    incomeCategoryId = incomeCategory.id;
    expenseCategoryId = expenseCategory.id;
    otherOwnerCategoryId = foreignCategory.id;
    await Promise.all([
      ensureOtherCategories(ownerId, db),
      ensureOtherCategories(otherOwnerId, db),
    ]);
  }, 60_000);

  afterAll(async () => {
    if (db && ownerId && otherOwnerId) {
      await db
        .delete(goalTransaction)
        .where(
          or(
            eq(goalTransaction.userId, ownerId),
            eq(goalTransaction.userId, otherOwnerId),
          ),
        );
      await db
        .delete(goal)
        .where(or(eq(goal.userId, ownerId), eq(goal.userId, otherOwnerId)));
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

  it("isolates goals and links, and derives progress from current linked transaction values", async () => {
    const occurredOn = new Date().toISOString().slice(0, 10);
    await createGoal(ownerId, {
      name: "Mục tiêu tích hợp giả lập",
      targetAmount: "9007199254740993",
      targetDate: null,
    });
    await createGoal(otherOwnerId, {
      name: "Mục tiêu riêng giả lập",
      targetAmount: "1000",
      targetDate: null,
    });
    const ownerGoal = (await listGoals(ownerId))[0];
    if (!ownerGoal) {
      throw new Error("The owner goal was not created.");
    }
    expect(ownerGoal).toMatchObject({
      targetAmount: "9007199254740993",
      progress: "0",
      remaining: "9007199254740993",
    });
    expect((await listGoals(ownerId)).map((item) => item.name)).toEqual([
      "Mục tiêu tích hợp giả lập",
    ]);

    const linkedTransaction = await createTransaction(ownerId, {
      categoryId: incomeCategoryId,
      kind: "income",
      amount: "9007199254740000",
      occurredOn,
      description: "Đóng góp thu giả lập",
    });
    const unlinkedTransaction = await createTransaction(ownerId, {
      categoryId: expenseCategoryId,
      kind: "expense",
      amount: "700",
      occurredOn,
      description: "Giao dịch chưa liên kết giả lập",
    });
    const foreignTransaction = await createTransaction(otherOwnerId, {
      categoryId: otherOwnerCategoryId,
      kind: "income",
      amount: "999999",
      occurredOn,
      description: "Giao dịch user khác giả lập",
    });
    expect((await listGoals(ownerId))[0]?.progress).toBe("0");

    await expect(
      setGoalTransactionLink(
        otherOwnerId,
        ownerGoal.id,
        linkedTransaction.id,
        true,
      ),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      setGoalTransactionLink(
        ownerId,
        ownerGoal.id,
        foreignTransaction.id,
        true,
      ),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      fields: [
        {
          field: "transactionId",
          message: "Chỉ có thể liên kết giao dịch thuộc tài khoản của bạn.",
        },
      ],
    });
    await expect(
      listGoalTransactions(otherOwnerId, ownerGoal.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await setGoalTransactionLink(
      ownerId,
      ownerGoal.id,
      linkedTransaction.id,
      true,
    );
    await setGoalTransactionLink(
      ownerId,
      ownerGoal.id,
      unlinkedTransaction.id,
      true,
    );
    expect((await listGoals(ownerId))[0]).toMatchObject({
      progress: "9007199254740700",
      remaining: "293",
      isComplete: false,
    });

    await updateTransaction(ownerId, linkedTransaction.id, {
      categoryId: incomeCategoryId,
      kind: "income",
      amount: "9007199254741200",
      occurredOn,
      description: "Đóng góp đã sửa giả lập",
    });
    expect((await listGoals(ownerId))[0]).toMatchObject({
      progress: "9007199254741900",
      remaining: "0",
      isComplete: true,
    });

    await updateGoal(ownerId, ownerGoal.id, {
      name: "Mục tiêu đã sửa giả lập",
      targetAmount: "9007199254742000",
      targetDate: "2027-01-15",
    });
    expect((await listGoals(ownerId))[0]).toMatchObject({
      name: "Mục tiêu đã sửa giả lập",
      targetAmount: "9007199254742000",
      targetDate: "2027-01-15",
      progress: "9007199254741900",
      remaining: "100",
      isComplete: false,
    });

    await deleteTransaction(ownerId, linkedTransaction.id);
    expect((await listGoals(ownerId))[0]).toMatchObject({
      progress: "700",
      remaining: "9007199254741300",
    });
    await setGoalTransactionLink(
      ownerId,
      ownerGoal.id,
      unlinkedTransaction.id,
      false,
    );
    expect((await listGoals(ownerId))[0]).toMatchObject({
      progress: "0",
      remaining: "9007199254742000",
    });

    const [remainingGoalLinks] = await db
      .select({ goalId: goalTransaction.goalId })
      .from(goalTransaction)
      .where(eq(goalTransaction.userId, ownerId));
    expect(remainingGoalLinks).toBeUndefined();
  });
});
