import "dotenv/config";
import { randomUUID } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { account, user } from "@/db/schema/auth";
import { category } from "@/db/schema/categories";
import { assetBalance } from "@/db/schema/assets";
import { debt } from "@/db/schema/debts";
import { debtPayment } from "@/db/schema/debt-payments";
import { monthlyHistorySnapshot } from "@/db/schema/history";
import { transaction } from "@/db/schema/finance";
import { ensureOtherCategories } from "@/features/categories/category.repository";
import { createDebt } from "@/features/debts/debt.service";
import { recordDebtPayment } from "@/features/debts/payment.service";
import { backfillHistoricalTransaction } from "@/features/history/backfill.service";
import { getMonthlyHistory } from "@/features/history/history.service";
import {
  createTransaction,
  deleteTransaction,
  getTransaction,
  listCurrentMonthTransactions,
  updateTransaction,
} from "@/features/transactions/transaction.service";
import { previousMonth } from "@/features/dashboard/dashboard.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
const testPassword = "transaction-integration-test-password";
let db: Database;
let ownerId: string;
let otherOwnerId: string;
let ownerIncomeCategoryId: string;
let ownerExpenseCategoryId: string;
let ownerIncomeCategoryIds: string[];
let ownerExpenseCategoryIds: string[];
let ownerIncomeOtherCategoryId: string;
let ownerExpenseOtherCategoryId: string;
let otherCategoryId: string;
let targetMonth: string;
let today: string;
let transactionServer: ChildProcess | undefined;
let transactionServerError: Error | undefined;
let transactionServerUrl: string;
let originalDatabaseUrl: string | undefined;
let transactionServerProjectDir: string | undefined;

function databaseName(url: URL): string {
  return decodeURIComponent(url.pathname.slice(1));
}

function ensureIsolatedTestDatabase(): void {
  if (!testDatabaseUrl || !applicationDatabaseUrl) {
    throw new Error(
      "Both TEST_DATABASE_URL and DATABASE_URL are required for isolated transaction integration tests.",
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
      "Refusing to run transaction integration tests against the application database.",
    );
  }
}

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => resolve());
  });
  const address = listener.address();
  if (!address || typeof address === "string") {
    throw new Error(
      "Could not allocate a port for the transaction test server.",
    );
  }
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function stopTransactionServer(): Promise<void> {
  if (!transactionServer || transactionServer.exitCode !== null) return;
  const server = transactionServer;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5_000);
    server.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    server.kill("SIGTERM");
  });
}

async function createTransactionServerProject(): Promise<string> {
  const projectDir = await mkdtemp(
    join(tmpdir(), "personal-finance-transactions-"),
  );
  for (const entry of ["app", "src"]) {
    await cp(resolve(process.cwd(), entry), join(projectDir, entry), {
      recursive: true,
    });
  }
  for (const entry of [
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next-env.d.ts",
  ]) {
    await cp(resolve(process.cwd(), entry), join(projectDir, entry));
  }
  await symlink(
    resolve(process.cwd(), "node_modules"),
    join(projectDir, "node_modules"),
  );
  const baseConfig = resolve(process.cwd(), "next.config.ts");
  await writeFile(
    join(projectDir, "next.config.ts"),
    `import config from ${JSON.stringify(baseConfig)};\nexport default { ...config, distDir: ".next" };\n`,
  );
  return projectDir;
}

async function startTransactionServer(): Promise<void> {
  const port = await availablePort();
  transactionServerProjectDir = await createTransactionServerProject();
  transactionServerUrl = `http://127.0.0.1:${port}`;
  transactionServer = spawn(
    process.execPath,
    [
      new URL("../../../node_modules/next/dist/bin/next", import.meta.url)
        .pathname,
      "dev",
      transactionServerProjectDir,
      "--hostname",
      "127.0.0.1",
      "--webpack",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DATABASE_URL: testDatabaseUrl,
        BETTER_AUTH_URL: transactionServerUrl,
      },
      stdio: "ignore",
    },
  );
  transactionServer.on("error", (error) => {
    transactionServerError = error;
  });

  const deadline = Date.now() + 90_000;
  try {
    while (Date.now() < deadline) {
      if (transactionServerError) {
        throw new Error(
          "Could not start the isolated transaction test server.",
          {
            cause: transactionServerError,
          },
        );
      }
      if (transactionServer.exitCode !== null) {
        throw new Error("The isolated transaction test server exited early.");
      }
      try {
        const response = await fetch(`${transactionServerUrl}/login`);
        if (response.ok) return;
      } catch {
        await delay(250);
      }
    }
    throw new Error(
      "The isolated transaction test server did not become ready.",
    );
  } catch (error) {
    await stopTransactionServer();
    throw error;
  }
}

function transactionInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    categoryId: ownerExpenseCategoryId,
    kind: "expense",
    amount: "250",
    occurredOn: today,
    description: "Giao dịch tích hợp giả lập",
    ...overrides,
  };
}

describe("transaction PostgreSQL integration and Server Actions", () => {
  beforeAll(async () => {
    ensureIsolatedTestDatabase();
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    today = `${targetMonth}-${String(now.getDate()).padStart(2, "0")}`;
    ownerId = `fake-transaction-owner-${randomUUID()}`;
    otherOwnerId = `fake-transaction-other-${randomUUID()}`;

    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Transaction Owner",
        email: `${ownerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Other Transaction Owner",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      },
    ]);
    await db.insert(account).values({
      id: randomUUID(),
      accountId: ownerId,
      providerId: "credential",
      userId: ownerId,
      password: await hashPassword(testPassword),
      createdAt: now,
      updatedAt: now,
    });

    const [incomeCategory, expenseCategory, foreignCategory] = await db
      .insert(category)
      .values([
        { userId: ownerId, name: "Lương giả lập", kind: "income" },
        { userId: ownerId, name: "Ăn uống giả lập", kind: "expense" },
        { userId: otherOwnerId, name: "Riêng tư giả lập", kind: "income" },
      ])
      .returning();
    ownerIncomeCategoryId = incomeCategory.id;
    ownerExpenseCategoryId = expenseCategory.id;
    otherCategoryId = foreignCategory.id;
    await ensureOtherCategories(ownerId, db);
    const otherCategories = await db
      .select({
        id: category.id,
        kind: category.kind,
        name: category.name,
      })
      .from(category)
      .where(eq(category.userId, ownerId));
    const incomeOtherCategory = otherCategories.find(
      (item) => item.kind === "income" && item.name === "Khác",
    );
    const expenseOtherCategory = otherCategories.find(
      (item) => item.kind === "expense" && item.name === "Khác",
    );
    if (!incomeOtherCategory || !expenseOtherCategory) {
      throw new Error("Missing income or expense Khác category in test data.");
    }
    ownerIncomeOtherCategoryId = incomeOtherCategory.id;
    ownerExpenseOtherCategoryId = expenseOtherCategory.id;
    ownerIncomeCategoryIds = otherCategories
      .filter((item) => item.kind === "income")
      .map((item) => item.id);
    ownerExpenseCategoryIds = otherCategories
      .filter((item) => item.kind === "expense")
      .map((item) => item.id);
    expect(ownerIncomeOtherCategoryId).not.toBe(ownerExpenseOtherCategoryId);

    const previousDate = `${previousMonth(targetMonth)}-15`;
    await db.insert(transaction).values([
      {
        userId: ownerId,
        categoryId: ownerIncomeCategoryId,
        kind: "income",
        amount: 500n,
        occurredOn: previousDate,
        description: "Giao dịch tháng trước giả lập",
      },
      {
        userId: otherOwnerId,
        categoryId: otherCategoryId,
        kind: "income",
        amount: 999_999n,
        occurredOn: today,
        description: "Giao dịch riêng tư giả lập",
      },
      {
        userId: otherOwnerId,
        categoryId: otherCategoryId,
        kind: "income",
        amount: 888_888n,
        occurredOn: previousDate,
        description: "Giao dịch tháng trước của user khác giả lập",
      },
    ]);
    await startTransactionServer();
  }, 120_000);

  afterAll(async () => {
    await stopTransactionServer();
    if (transactionServerProjectDir) {
      await rm(transactionServerProjectDir, { recursive: true, force: true });
    }
    if (db && ownerId && otherOwnerId) {
      await db
        .delete(debtPayment)
        .where(
          or(
            eq(debtPayment.userId, ownerId),
            eq(debtPayment.userId, otherOwnerId),
          ),
        );
      await db
        .delete(transaction)
        .where(
          or(
            eq(transaction.userId, ownerId),
            eq(transaction.userId, otherOwnerId),
          ),
        );
      await db
        .delete(debt)
        .where(or(eq(debt.userId, ownerId), eq(debt.userId, otherOwnerId)));
      await db
        .delete(assetBalance)
        .where(
          or(
            eq(assetBalance.userId, ownerId),
            eq(assetBalance.userId, otherOwnerId),
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

  it("creates, reads, updates, deletes, filters by month, and enforces ownership", async () => {
    const created = await createTransaction(ownerId, transactionInput());
    expect(created.amount).toBe("250");
    expect(created.userId).toBe(ownerId);
    expect(await getTransaction(ownerId, created.id)).toMatchObject({
      id: created.id,
      amount: "250",
      categoryId: ownerExpenseCategoryId,
    });

    const listed = await listCurrentMonthTransactions(ownerId);
    expect(listed.map((item) => item.id)).toContain(created.id);
    expect(
      listed.some(
        (item) => item.description === "Giao dịch tháng trước giả lập",
      ),
    ).toBe(false);
    expect(
      listed.some((item) => item.description === "Giao dịch riêng tư giả lập"),
    ).toBe(false);

    await expect(
      getTransaction(otherOwnerId, created.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      updateTransaction(otherOwnerId, created.id, transactionInput()),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      deleteTransaction(otherOwnerId, created.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      createTransaction(
        ownerId,
        transactionInput({ categoryId: ownerIncomeCategoryId }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createTransaction(
        ownerId,
        transactionInput({ categoryId: otherCategoryId, kind: "income" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const fallbackIncome = await createTransaction(
      ownerId,
      transactionInput({
        categoryId: null,
        kind: "income",
        amount: "-125",
      }),
    );
    const fallback = await db
      .select()
      .from(category)
      .where(eq(category.id, fallbackIncome.categoryId));
    expect(fallback[0]).toMatchObject({ name: "Khác", kind: "income" });

    const updated = await updateTransaction(
      ownerId,
      created.id,
      transactionInput({
        amount: "-9007199254740993",
        description: "Giao dịch đã sửa giả lập",
      }),
    );
    expect(updated.amount).toBe("-9007199254740993");
    expect(updated.description).toBe("Giao dịch đã sửa giả lập");
    expect(
      (await listCurrentMonthTransactions(ownerId)).map((item) => item.id),
    ).toContain(created.id);

    await deleteTransaction(ownerId, created.id);
    await expect(getTransaction(ownerId, created.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  }, 30_000);

  it("prevents editing and deleting a transaction linked to debt payment", async () => {
    const createdDebt = await createDebt(ownerId, {
      borrowerName: "Khoản nợ tích hợp giả lập",
      loanType: "Vay kiểm thử",
      balanceAsOf: today,
      balanceAmount: "1000",
      dueDate: today,
      principalDuePerPeriod: "100",
      interestDuePerPeriod: "10",
      paymentDuePerPeriod: "110",
      finalPeriod: null,
    });
    const payment = await recordDebtPayment(ownerId, createdDebt.id, {
      period: targetMonth,
      paidOn: today,
      principalAmount: "100",
      interestAmount: "10",
    });

    expect(await getTransaction(ownerId, payment.transactionId)).toMatchObject({
      id: payment.transactionId,
      isDebtPayment: true,
      amount: "110",
    });
    await expect(
      updateTransaction(
        ownerId,
        payment.transactionId,
        transactionInput({ amount: "500" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      deleteTransaction(ownerId, payment.transactionId),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const [persistedTransaction] = await db
      .select()
      .from(transaction)
      .where(eq(transaction.id, payment.transactionId));
    expect(persistedTransaction.amount).toBe(110n);
    expect(persistedTransaction.userId).toBe(ownerId);
  });

  it("reads only the selected user's actual historical transactions and payments", async () => {
    const month = previousMonth(targetMonth);
    const ownerHistory = await getMonthlyHistory(ownerId, month);
    const otherHistory = await getMonthlyHistory(otherOwnerId, month);

    expect(ownerHistory.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Giao dịch tháng trước giả lập",
          amount: "500",
        }),
      ]),
    );
    expect(
      ownerHistory.transactions.some((item) =>
        item.description?.includes("user khác"),
      ),
    ).toBe(false);
    expect(otherHistory.transactions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          description: "Giao dịch tháng trước của user khác giả lập",
        }),
      ]),
    );
    await expect(
      backfillHistoricalTransaction(ownerId, {
        categoryId: ownerIncomeCategoryId,
        kind: "income",
        amount: "10",
        occurredOn: today,
        description: "Ngày hiện tại không phải backfill",
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("creates and edits a transaction through the authenticated browser Server Actions", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage();
      const pageErrors: string[] = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));

      const signInResponse = await fetch(
        `${transactionServerUrl}/api/auth/sign-in/email`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: transactionServerUrl,
          },
          body: JSON.stringify({
            email: `${ownerId}@example.invalid`,
            password: testPassword,
          }),
        },
      );
      expect(signInResponse.ok).toBe(true);
      const cookies = signInResponse.headers
        .getSetCookie()
        .map((cookie) => cookie.split(";", 1)[0])
        .map((cookie) => {
          const separator = cookie.indexOf("=");
          return {
            name: cookie.slice(0, separator),
            value: cookie.slice(separator + 1),
            url: transactionServerUrl,
          };
        });
      expect(cookies.length).toBeGreaterThan(0);
      await page.context().addCookies(cookies);
      await page.goto(`${transactionServerUrl}/dashboard`);
      await browserExpect(page).toHaveURL(/\/dashboard$/);

      await page.goto(`${transactionServerUrl}/transactions`);
      await browserExpect(
        page.getByRole("link", { name: "Giao dịch" }),
      ).toBeVisible();
      const debtPaymentCard = page
        .locator(".transaction-card")
        .filter({ hasText: "Khoản nợ tích hợp giả lập" });
      await browserExpect(debtPaymentCard).toContainText(
        "Thanh toán nợ · chỉ xem",
      );
      await browserExpect(
        debtPaymentCard.getByRole("button", { name: "Sửa" }),
      ).toHaveCount(0);
      await browserExpect(
        debtPaymentCard.getByRole("button", { name: "Xóa" }),
      ).toHaveCount(0);

      const createForm = page.locator("form.transaction-form").first();
      const kindSelect = createForm.getByLabel("Loại giao dịch");
      const categorySelect = createForm.getByLabel("Danh mục");
      await categorySelect.selectOption(ownerExpenseOtherCategoryId);
      await expectCategorySubmission(
        createForm,
        categorySelect,
        "expense",
        ownerExpenseCategoryIds,
        ownerExpenseOtherCategoryId,
      );
      await createForm.getByLabel("Số tiền (₫)").fill("250");
      await createForm.getByLabel("Ngày giao dịch").fill(today);
      await createForm
        .getByLabel("Mô tả (không bắt buộc)")
        .fill("Tạo khoản chi qua Server Action");
      await createForm.getByRole("button", { name: "Thêm giao dịch" }).click();
      await browserExpect(
        page.getByRole("status").filter({ hasText: "Đã thêm giao dịch." }),
      ).toBeVisible();
      await browserExpect(
        page
          .locator(".transaction-card")
          .filter({ hasText: "Tạo khoản chi qua Server Action" }),
      ).toContainText("250");

      await kindSelect.selectOption("income");
      await expectCategorySubmission(
        createForm,
        categorySelect,
        "income",
        ownerIncomeCategoryIds,
      );
      await kindSelect.selectOption("expense");
      await expectCategorySubmission(
        createForm,
        categorySelect,
        "expense",
        ownerExpenseCategoryIds,
      );
      await kindSelect.selectOption("income");
      await categorySelect.selectOption(ownerIncomeOtherCategoryId);
      await expectCategorySubmission(
        createForm,
        categorySelect,
        "income",
        ownerIncomeCategoryIds,
        ownerIncomeOtherCategoryId,
      );
      await createForm.getByLabel("Số tiền (₫)").fill("321");
      await createForm.getByLabel("Ngày giao dịch").fill(today);
      await createForm
        .getByLabel("Mô tả (không bắt buộc)")
        .fill("Tạo khoản thu qua Server Action");
      await createForm.getByRole("button", { name: "Thêm giao dịch" }).click();
      await browserExpect(
        page.getByRole("status").filter({ hasText: "Đã thêm giao dịch." }),
      ).toBeVisible();

      const transactionCard = page
        .locator(".transaction-card")
        .filter({ hasText: "Tạo khoản thu qua Server Action" });
      await browserExpect(transactionCard).toContainText("321");

      await page.getByRole("link", { name: "Mục tiêu" }).click();
      const createGoalForm = page.locator("form.goal-form").first();
      await createGoalForm
        .getByLabel("Tên mục tiêu")
        .fill("Mục tiêu tiết kiệm qua giao diện");
      await createGoalForm.getByLabel("Số tiền mục tiêu (₫)").fill("500");
      await createGoalForm
        .getByRole("button", { name: "Tạo mục tiêu" })
        .click();
      await browserExpect(
        createGoalForm
          .getByRole("status")
          .filter({ hasText: "Đã tạo mục tiêu tiết kiệm." }),
      ).toBeVisible();
      const goalCard = page
        .locator(".goal-card")
        .filter({ hasText: "Mục tiêu tiết kiệm qua giao diện" });
      await browserExpect(goalCard).toContainText("0 ₫");
      const goalTransactions = goalCard.locator(".goal-transactions");
      await goalTransactions.locator("summary").click();

      const expenseContribution = goalTransactions
        .locator(".goal-transaction-row")
        .filter({ hasText: "Tạo khoản chi qua Server Action" });
      await expenseContribution
        .getByRole("button", { name: "Liên kết" })
        .click();
      await browserExpect(
        expenseContribution
          .getByRole("status")
          .filter({ hasText: "Đã liên kết giao dịch." }),
      ).toBeVisible();
      await browserExpect(goalCard.locator(".goal-progress")).toContainText(
        "250 ₫",
      );

      const incomeContribution = goalTransactions
        .locator(".goal-transaction-row")
        .filter({ hasText: "Tạo khoản thu qua Server Action" });
      await incomeContribution
        .getByRole("button", { name: "Liên kết" })
        .click();
      await browserExpect(
        incomeContribution
          .getByRole("status")
          .filter({ hasText: "Đã liên kết giao dịch." }),
      ).toBeVisible();
      await browserExpect(goalCard.locator(".goal-progress")).toContainText(
        "571 ₫",
      );

      await goalCard.getByRole("button", { name: "Sửa mục tiêu" }).click();
      const editGoalForm = goalCard.locator("form.goal-form");
      await editGoalForm.getByLabel("Tên mục tiêu").fill("Mục tiêu đã sửa");
      await editGoalForm.getByLabel("Số tiền mục tiêu (₫)").fill("600");
      await editGoalForm.getByRole("button", { name: "Lưu thay đổi" }).click();
      await browserExpect(
        page.getByRole("status").filter({ hasText: "Đã cập nhật mục tiêu." }),
      ).toBeVisible();
      const updatedGoalCard = page
        .locator(".goal-card")
        .filter({ hasText: "Mục tiêu đã sửa" });
      await browserExpect(
        updatedGoalCard.locator(".goal-progress"),
      ).toContainText("571 ₫");
      await browserExpect(
        updatedGoalCard.locator(".goal-progress"),
      ).toContainText("29 ₫");

      await page.getByRole("link", { name: "Giao dịch" }).click();
      const editableTransactionCard = page
        .locator(".transaction-card")
        .filter({ hasText: "Tạo khoản thu qua Server Action" });
      await editableTransactionCard
        .getByRole("button", { name: "Sửa" })
        .click();

      const editor = editableTransactionCard.locator(".transaction-editor");
      await editor.getByLabel("Số tiền (₫)").fill("-456");
      await editor
        .getByLabel("Mô tả (không bắt buộc)")
        .fill("Đã sửa qua Server Action");
      await editor.getByRole("button", { name: "Lưu thay đổi" }).click();
      await browserExpect(
        page.getByRole("status").filter({ hasText: "Đã cập nhật giao dịch." }),
      ).toBeVisible();
      const updatedTransactionCard = page
        .locator(".transaction-card")
        .filter({ hasText: "Đã sửa qua Server Action" });
      await browserExpect(updatedTransactionCard).toContainText(
        "Đã sửa qua Server Action",
      );
      await browserExpect(updatedTransactionCard).toContainText("-456");

      await page.getByRole("link", { name: "Mục tiêu" }).click();
      const updatedGoalAfterTransactionEdit = page
        .locator(".goal-card")
        .filter({ hasText: "Mục tiêu đã sửa" });
      await browserExpect(
        updatedGoalAfterTransactionEdit.locator(".goal-progress"),
      ).toContainText("-206 ₫");
      await browserExpect(
        updatedGoalAfterTransactionEdit.locator(".goal-progress"),
      ).toContainText("806 ₫");

      await page.goto(`${transactionServerUrl}/dashboard`);
      await browserExpect(
        page.locator(".metric-card--income .metric-value"),
      ).toContainText("-581");

      await page.goto(`${transactionServerUrl}/categories`);
      const defaultCategoryRows = page
        .locator(".category-list li")
        .filter({ hasText: "Khác" });
      await browserExpect(defaultCategoryRows).toHaveCount(2);
      await browserExpect(
        defaultCategoryRows.getByRole("button", { name: "Xóa" }),
      ).toHaveCount(0);

      const categoryForm = page.locator("form.finance-form").first();
      const usedCategoryName = "Danh mục dùng thử qua giao diện";
      await categoryForm.getByLabel("Tên danh mục").fill(usedCategoryName);
      await categoryForm.getByLabel("Loại giao dịch").selectOption("expense");
      await categoryForm.getByLabel("Đánh dấu là tiết kiệm tháng này").check();
      await categoryForm.getByRole("button", { name: "Thêm danh mục" }).click();
      await browserExpect(
        categoryForm
          .getByRole("status")
          .filter({ hasText: "Đã tạo danh mục." }),
      ).toBeVisible();
      const usedCategoryRow = page
        .locator(".category-list li")
        .filter({ hasText: usedCategoryName });
      await browserExpect(usedCategoryRow).toContainText("Chi tiêu");
      await browserExpect(usedCategoryRow).toContainText("Tiết kiệm tháng");

      const [usedCategory] = await db
        .select({ id: category.id })
        .from(category)
        .where(
          and(
            eq(category.userId, ownerId),
            eq(category.name, usedCategoryName),
            eq(category.kind, "expense"),
          ),
        );
      if (!usedCategory) {
        throw new Error("The UI-created category was not persisted.");
      }
      const linkedTransaction = await createTransaction(ownerId, {
        categoryId: usedCategory.id,
        kind: "expense",
        amount: "789",
        occurredOn: today,
        description: "Giao dịch giữ nguyên khi xóa danh mục bị chặn",
      });
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("xóa danh mục");
        await dialog.accept();
      });
      await usedCategoryRow.getByRole("button", { name: "Xóa" }).click();
      await browserExpect(
        usedCategoryRow
          .getByRole("alert")
          .filter({ hasText: "đang có giao dịch sử dụng" }),
      ).toBeVisible();
      expect(await getTransaction(ownerId, linkedTransaction.id)).toMatchObject(
        {
          id: linkedTransaction.id,
          categoryId: usedCategory.id,
        },
      );

      const removableCategoryName = "Danh mục xóa thử qua giao diện";
      await categoryForm.getByLabel("Tên danh mục").fill(removableCategoryName);
      await categoryForm.getByLabel("Loại giao dịch").selectOption("income");
      await categoryForm
        .getByLabel("Đánh dấu là tiết kiệm tháng này")
        .uncheck();
      await categoryForm.getByRole("button", { name: "Thêm danh mục" }).click();
      await browserExpect(
        categoryForm
          .getByRole("status")
          .filter({ hasText: "Đã tạo danh mục." }),
      ).toBeVisible();
      const removableCategoryRow = page
        .locator(".category-list li")
        .filter({ hasText: removableCategoryName });
      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("xóa danh mục");
        await dialog.accept();
      });
      await removableCategoryRow.getByRole("button", { name: "Xóa" }).click();
      await browserExpect(
        page
          .locator(".category-list li")
          .filter({ hasText: removableCategoryName }),
      ).toHaveCount(0);

      const historicalMonth = previousMonth(targetMonth);
      const historicalDate = `${historicalMonth}-15`;
      await page.goto(`${transactionServerUrl}/history/backfill`);
      await browserExpect(
        page.getByRole("heading", { name: "Dữ liệu lịch sử ban đầu" }),
      ).toBeVisible();
      await browserExpect(page.getByRole("status")).toContainText(
        "Chưa xác nhận hoàn tất. Chưa có tháng nào bị khóa tự động.",
      );
      const initialSnapshots = await db
        .select({ id: monthlyHistorySnapshot.id })
        .from(monthlyHistorySnapshot)
        .where(eq(monthlyHistorySnapshot.userId, ownerId));
      expect(initialSnapshots).toHaveLength(0);

      const backfillTransactionForm = page.locator("form.transaction-form");
      await backfillTransactionForm
        .getByLabel("Loại giao dịch")
        .selectOption("income");
      await backfillTransactionForm
        .getByLabel("Danh mục")
        .selectOption(ownerIncomeCategoryId);
      await backfillTransactionForm.getByLabel("Số tiền (₫)").fill("4321");
      await backfillTransactionForm
        .getByLabel("Ngày giao dịch")
        .fill(historicalDate);
      await backfillTransactionForm
        .getByLabel("Mô tả (không bắt buộc)")
        .fill("Giao dịch backfill qua giao diện");
      await backfillTransactionForm
        .getByRole("button", { name: "Nhập giao dịch lịch sử" })
        .click();
      await browserExpect(
        backfillTransactionForm
          .getByRole("status")
          .filter({ hasText: "Đã nhập bổ sung giao dịch." }),
      ).toBeVisible();

      const backfillAssetForm = page
        .locator("form.finance-form")
        .filter({ has: page.locator('input[name="asOfDate"]') });
      await backfillAssetForm
        .getByLabel("Ngày chốt số dư")
        .fill(historicalDate);
      await backfillAssetForm.getByLabel("Tiền mặt (₫)").fill("1000");
      await backfillAssetForm.getByLabel("Tiền gửi tiết kiệm (₫)").fill("2000");
      await backfillAssetForm
        .getByLabel("Vật tương đương tiền (₫)")
        .fill("3000");
      await backfillAssetForm
        .getByRole("button", { name: "Nhập số dư lịch sử" })
        .click();
      await browserExpect(
        backfillAssetForm
          .getByRole("status")
          .filter({ hasText: "Đã nhập bổ sung số dư tài sản." }),
      ).toBeVisible();
      const savedHistoricalAssets = await db
        .select({
          kind: assetBalance.kind,
          amount: assetBalance.amount,
        })
        .from(assetBalance)
        .where(
          and(
            eq(assetBalance.userId, ownerId),
            eq(assetBalance.asOfDate, historicalDate),
          ),
        );
      expect(savedHistoricalAssets).toHaveLength(3);
      expect(
        savedHistoricalAssets.map((item) => [item.kind, item.amount]),
      ).toEqual(
        expect.arrayContaining([
          ["cash", 1000n],
          ["savings_deposit", 2000n],
          ["cash_equivalent", 3000n],
        ]),
      );

      const backfillDebtForm = page.locator("form.debt-form");
      await backfillDebtForm.getByLabel("Tên người vay").fill("Nợ backfill");
      await backfillDebtForm.getByLabel("Loại vay").fill("Vay lịch sử");
      await backfillDebtForm.getByLabel("Dư nợ tại ngày chốt (₫)").fill("4000");
      await backfillDebtForm.getByLabel("Ngày chốt dư nợ").fill(historicalDate);
      await backfillDebtForm.getByLabel("Ngày đến hạn").fill(historicalDate);
      await backfillDebtForm.getByLabel("Gốc trả trong kỳ (₫)").fill("1000");
      await backfillDebtForm.getByLabel("Lãi trả trong kỳ (₫)").fill("100");
      await backfillDebtForm
        .getByLabel("Tổng phải trả mỗi kỳ (₫)")
        .fill("1100");
      await backfillDebtForm
        .getByRole("button", { name: "Nhập khoản nợ lịch sử" })
        .click();
      await browserExpect(
        backfillDebtForm
          .getByRole("status")
          .filter({ hasText: "Đã nhập bổ sung thông tin khoản nợ." }),
      ).toBeVisible();

      const [backfilledDebt] = await db
        .select({ id: debt.id })
        .from(debt)
        .where(
          and(eq(debt.userId, ownerId), eq(debt.borrowerName, "Nợ backfill")),
        );
      if (!backfilledDebt) {
        throw new Error("The UI-created historical debt was not persisted.");
      }
      await recordDebtPayment(ownerId, backfilledDebt.id, {
        period: historicalMonth,
        paidOn: historicalDate,
        principalAmount: "1000",
        interestAmount: "100",
      });

      await page.goto(
        `${transactionServerUrl}/history/backfill?startMonth=${historicalMonth}&endMonth=${historicalMonth}`,
      );
      const confirmBackfillForm = page.locator("form.backfill-confirm-form");
      await browserExpect(confirmBackfillForm).toBeVisible();
      await confirmBackfillForm.getByRole("checkbox").check();
      await confirmBackfillForm
        .getByRole("button", { name: "Xác nhận chốt lịch sử" })
        .click();
      await browserExpect(page.getByRole("status")).toContainText(
        "Quy trình backfill đã được xác nhận",
      );

      await page.goto(
        `${transactionServerUrl}/history?month=${historicalMonth}`,
      );
      await browserExpect(
        page.getByRole("heading", { name: /Lịch sử/ }),
      ).toBeVisible();
      await browserExpect(
        page.locator(".history-card").filter({
          hasText: "Giao dịch backfill qua giao diện",
        }),
      ).toContainText("4.321");
      await browserExpect(
        page
          .locator('.history-section[aria-labelledby="history-payments"]')
          .locator(".history-card")
          .filter({ hasText: "Nợ backfill" }),
      ).toContainText("1.100");
      const historicalDebtSection = page.locator(
        '.history-section[aria-labelledby="history-debts"]',
      );
      await browserExpect(
        historicalDebtSection
          .locator(".history-card")
          .filter({ hasText: "Nợ backfill" }),
      ).toContainText("3.000 ₫");
      await browserExpect(
        historicalDebtSection
          .locator(".history-card")
          .filter({ hasText: "Khoản nợ tích hợp giả lập" }),
      ).toContainText("Chưa đủ dữ liệu lịch sử để xác định dư nợ tháng này.");
      await browserExpect(
        page
          .locator('.history-section[aria-labelledby="history-assets"]')
          .locator(".history-card")
          .filter({ hasText: "Vật tương đương tiền" }),
      ).toBeVisible();
      await browserExpect(
        page.getByText("Giao dịch tháng trước của user khác giả lập"),
      ).toHaveCount(0);
      expect(pageErrors).toEqual([]);
    } finally {
      await browser.close();
    }
  }, 90_000);
});

async function expectCategorySubmission(
  form: import("@playwright/test").Locator,
  categorySelect: import("@playwright/test").Locator,
  kind: "income" | "expense",
  validCategoryIds: readonly string[],
  expectedCategoryId?: string,
): Promise<void> {
  if (expectedCategoryId) {
    await browserExpect(categorySelect).toHaveValue(expectedCategoryId);
  }
  const submittedValues = await form.evaluate((element) => {
    const formElement = element as HTMLFormElement;
    const formData = new FormData(formElement);
    const categorySelect = formElement.elements.namedItem("categoryId");
    return {
      kind: formData.get("kind"),
      categoryId: formData.get("categoryId"),
      selectedCategoryId:
        categorySelect instanceof HTMLSelectElement
          ? categorySelect.value
          : null,
    };
  });
  expect(submittedValues.kind).toBe(kind);
  expect(submittedValues.categoryId).toBe(submittedValues.selectedCategoryId);
  expect(validCategoryIds).toContain(submittedValues.categoryId);
  if (expectedCategoryId) {
    expect(submittedValues.categoryId).toBe(expectedCategoryId);
  }
}
