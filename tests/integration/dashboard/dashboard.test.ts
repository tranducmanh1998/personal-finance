import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { assetBalance } from "@/db/schema/assets";
import { category } from "@/db/schema/categories";
import { debt } from "@/db/schema/debts";
import { transaction } from "@/db/schema/finance";
import { account, user } from "@/db/schema/auth";
import {
  getLatestAssetBalances,
  getDashboardSummary,
} from "@/features/dashboard/dashboard.repository";
import {
  ensureOtherCategories,
  createUserCategory,
  listUserCategories,
  selectMonthlySavingsCategory,
} from "@/features/categories/category.repository";
import { saveAssetBalances } from "@/features/assets/asset.repository";
import { previousMonth } from "@/features/dashboard/dashboard.service";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
let db: Database;
let ownerId: string;
let otherOwnerId: string;
let targetMonth: string;
let originalDatabaseUrl: string | undefined;
let dashboardServer: ChildProcess | undefined;
let dashboardServerError: Error | undefined;
let dashboardUrl: string;
let dashboardServerProjectDir: string | undefined;
const testPassword = "integration-test-password";

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => resolve());
  });
  const address = listener.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a port for the dashboard test server.");
  }
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function stopDashboardServer(): Promise<void> {
  if (!dashboardServer || dashboardServer.exitCode !== null) return;

  const server = dashboardServer;
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

async function createDashboardServerProject(): Promise<string> {
  const projectDir = await mkdtemp(
    join(tmpdir(), "personal-finance-dashboard-"),
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

async function startDashboardServer(): Promise<void> {
  const port = await availablePort();
  dashboardServerProjectDir = await createDashboardServerProject();
  dashboardUrl = `http://127.0.0.1:${port}`;
  dashboardServer = spawn(
    process.execPath,
    [
      new URL("../../../node_modules/next/dist/bin/next", import.meta.url)
        .pathname,
      "dev",
      dashboardServerProjectDir,
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
        BETTER_AUTH_URL: dashboardUrl,
      },
      stdio: "ignore",
    },
  );
  dashboardServer.on("error", (error) => {
    dashboardServerError = error;
  });

  const deadline = Date.now() + 90_000;
  try {
    while (Date.now() < deadline) {
      if (dashboardServerError) {
        throw new Error("Could not start the isolated dashboard test server.", {
          cause: dashboardServerError,
        });
      }
      if (dashboardServer.exitCode !== null) {
        throw new Error("The isolated dashboard test server exited early.");
      }
      try {
        const response = await fetch(`${dashboardUrl}/login`);
        if (response.ok) return;
      } catch {
        // The server can take a moment to compile its first route.
      }
      await delay(250);
    }
    throw new Error("The isolated dashboard test server did not become ready.");
  } catch (error) {
    await stopDashboardServer();
    throw error;
  }
}

if (!testDatabaseUrl) {
  throw new Error(
    "Set TEST_DATABASE_URL to a disposable PostgreSQL database ending in _test.",
  );
}

describe("dashboard PostgreSQL integration", () => {
  beforeAll(async () => {
    const databaseName = new URL(testDatabaseUrl).pathname.slice(1);
    if (!databaseName.endsWith("_test")) {
      throw new Error(
        "TEST_DATABASE_URL must point to a dedicated database ending in _test.",
      );
    }

    originalDatabaseUrl = process.env.DATABASE_URL;
    if (originalDatabaseUrl) {
      const applicationUrl = new URL(originalDatabaseUrl);
      const testUrl = new URL(testDatabaseUrl);
      const databaseNameFromUrl = (url: URL) =>
        decodeURIComponent(url.pathname.slice(1));
      if (
        applicationUrl.hostname.toLowerCase() ===
          testUrl.hostname.toLowerCase() &&
        (applicationUrl.port || "5432") === (testUrl.port || "5432") &&
        databaseNameFromUrl(applicationUrl) === databaseNameFromUrl(testUrl)
      ) {
        throw new Error(
          "The integration test database must differ from the application database.",
        );
      }
    }
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    const now = new Date();
    targetMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const currentDate = `${targetMonth}-01`;
    const priorDate = `${previousMonth(targetMonth)}-15`;
    ownerId = `fake-${randomUUID()}`;
    otherOwnerId = `fake-${randomUUID()}`;
    const timestamp = new Date();
    await db.insert(user).values([
      {
        id: ownerId,
        name: "Synthetic Dashboard User",
        email: `${ownerId}@example.invalid`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      {
        id: otherOwnerId,
        name: "Synthetic Other User",
        email: `${otherOwnerId}@example.invalid`,
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    ]);
    await db.insert(account).values({
      id: randomUUID(),
      accountId: ownerId,
      providerId: "credential",
      userId: ownerId,
      password: await hashPassword(testPassword),
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    const [incomeCategory, expenseCategory, savingsCategory, otherCategory] =
      await db
        .insert(category)
        .values([
          {
            userId: ownerId,
            name: "Lương giả lập",
            kind: "income",
          },
          {
            userId: ownerId,
            name: "Ăn uống giả lập",
            kind: "expense",
          },
          {
            userId: ownerId,
            name: "Tiết kiệm giả lập",
            kind: "expense",
            isMonthlySavings: true,
          },
          {
            userId: otherOwnerId,
            name: "Riêng tư giả lập",
            kind: "income",
          },
        ])
        .returning();

    await db.insert(transaction).values([
      {
        userId: ownerId,
        categoryId: incomeCategory.id,
        kind: "income",
        amount: 1_000n,
        occurredOn: currentDate,
      },
      {
        userId: ownerId,
        categoryId: expenseCategory.id,
        kind: "expense",
        amount: 200n,
        occurredOn: currentDate,
      },
      {
        userId: ownerId,
        categoryId: savingsCategory.id,
        kind: "expense",
        amount: 300n,
        occurredOn: currentDate,
      },
      {
        userId: ownerId,
        categoryId: incomeCategory.id,
        kind: "income",
        amount: 500n,
        occurredOn: priorDate,
      },
      {
        userId: otherOwnerId,
        categoryId: otherCategory.id,
        kind: "income",
        amount: 99_999n,
        occurredOn: currentDate,
      },
    ]);
    await db.insert(assetBalance).values([
      {
        userId: ownerId,
        kind: "cash",
        amount: 1_000n,
        asOfDate: currentDate,
      },
      {
        userId: ownerId,
        kind: "savings_deposit",
        amount: 2_000n,
        asOfDate: currentDate,
      },
      {
        userId: ownerId,
        kind: "cash_equivalent",
        amount: 300n,
        asOfDate: currentDate,
      },
      {
        userId: otherOwnerId,
        kind: "cash",
        amount: 999_999n,
        asOfDate: currentDate,
      },
    ]);
    await db.insert(debt).values({
      userId: ownerId,
      borrowerName: "Ngân hàng giả lập",
      loanType: "Vay giả lập",
      balanceAsOf: currentDate,
      balanceAmount: 700n,
      principalDuePerPeriod: 0n,
      interestDuePerPeriod: 0n,
      paymentDuePerPeriod: 0n,
    });
    await startDashboardServer();
  }, 120_000);

  afterAll(async () => {
    await stopDashboardServer();
    if (dashboardServerProjectDir) {
      await rm(dashboardServerProjectDir, { recursive: true, force: true });
    }
    if (db && ownerId && otherOwnerId) {
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

  it("uses the selected month and returns only the authenticated user's category totals", async () => {
    const summary = await getDashboardSummary(ownerId, targetMonth, db);

    expect(summary.month).toBe(targetMonth);
    expect(summary.currentMonth.income).toBe("1000");
    expect(summary.currentMonth.expenses).toBe("500");
    expect(summary.currentMonth.monthlySavings).toBe("300");
    expect(summary.previousMonth.income).toBe("500");
    expect(summary.netWorth).toBe("2600");
    expect(summary.currentMonth.incomeByCategory).toEqual([
      {
        categoryId: expect.any(String),
        categoryName: "Lương giả lập",
        amount: "1000",
      },
    ]);
    expect(
      summary.currentMonth.expensesByCategory.map((item) => item.categoryName),
    ).toEqual(["Ăn uống giả lập", "Tiết kiệm giả lập"]);
    expect(
      JSON.stringify(summary).includes("Riêng tư giả lập"),
    ).toBe(false);

    const selectedPreviousMonth = await getDashboardSummary(
      ownerId,
      previousMonth(targetMonth),
      db,
    );
    expect(selectedPreviousMonth.currentMonth.income).toBe("500");
    expect(selectedPreviousMonth.currentMonth.expenses).toBe("0");
  });

  it("persists user-scoped asset and category changes and reflects them on dashboard reload", async () => {
    const asOfDate = `${targetMonth}-02`;
    await saveAssetBalances(
      ownerId,
      asOfDate,
      [
        { kind: "cash", amount: 1_100n },
        { kind: "savings_deposit", amount: 2_100n },
        { kind: "cash_equivalent", amount: 350n },
      ],
      db,
    );
    await createUserCategory(
      ownerId,
      { name: "Chi phí mới giả lập", kind: "expense", isMonthlySavings: false },
      db,
    );
    await createUserCategory(
      ownerId,
      {
        name: "Tiết kiệm mới giả lập",
        kind: "expense",
        isMonthlySavings: false,
      },
      db,
    );
    await ensureOtherCategories(ownerId, db);

    const persistedCategories = await listUserCategories(ownerId);
    const newSavingsCategory = persistedCategories.find(
      (item) => item.name === "Tiết kiệm mới giả lập",
    );
    expect(newSavingsCategory).toBeDefined();
    expect(persistedCategories.filter((item) => item.name === "Khác")).toHaveLength(
      2,
    );

    await selectMonthlySavingsCategory(ownerId, newSavingsCategory!.id, db);
    await db.insert(transaction).values({
      userId: ownerId,
      categoryId: newSavingsCategory!.id,
      kind: "expense",
      amount: 125n,
      occurredOn: asOfDate,
    });

    const reloadedBalances = await getLatestAssetBalances(ownerId);
    expect(reloadedBalances.get("cash")).toEqual({
      amount: "1100",
      asOfDate,
    });
    expect(reloadedBalances.get("savings_deposit")?.amount).toBe("2100");
    expect(reloadedBalances.get("cash_equivalent")?.amount).toBe("350");

    const reloadedCategories = await listUserCategories(ownerId);
    expect(
      reloadedCategories.find((item) => item.id === newSavingsCategory!.id)
        ?.isMonthlySavings,
    ).toBe(true);
    expect(
      reloadedCategories.find((item) => item.name === "Tiết kiệm giả lập")
        ?.isMonthlySavings,
    ).toBe(false);

    const updatedSummary = await getDashboardSummary(ownerId, targetMonth, db);
    expect(updatedSummary.netWorth).toBe("2850");
    expect(updatedSummary.currentMonth.expenses).toBe("625");
    expect(updatedSummary.currentMonth.monthlySavings).toBe("125");
    expect(
      updatedSummary.currentMonth.expensesByCategory.find(
        (item) => item.categoryName === "Tiết kiệm mới giả lập",
      )?.amount,
    ).toBe("125");
  });

  it(
    "authenticates over HTTP and limits dashboard data to the session",
    async () => {
      const anonymousResponse = await fetch(
        `${dashboardUrl}/dashboard?month=${targetMonth}`,
        { redirect: "manual" },
      );
      expect(anonymousResponse.status).toBeGreaterThanOrEqual(300);
      expect(anonymousResponse.status).toBeLessThan(400);
      expect(anonymousResponse.headers.get("location")).toContain("/login");
      expect(await anonymousResponse.text()).not.toContain("Lương giả lập");

      const signInResponse = await fetch(
        `${dashboardUrl}/api/auth/sign-in/email`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: dashboardUrl,
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
        .join("; ");
      expect(cookies).not.toBe("");

      const dashboardResponse = await fetch(
        `${dashboardUrl}/dashboard?month=${targetMonth}`,
        { headers: { cookie: cookies } },
      );
      expect(dashboardResponse.ok).toBe(true);
      const dashboard = await dashboardResponse.text();
      expect(dashboard).toContain(`value="${targetMonth}"`);
      expect(dashboard).toContain("1.000 ₫");
      expect(dashboard).toContain("500 ₫");
      expect(dashboard).toContain("200 ₫");
      expect(dashboard).toContain("300 ₫");
      expect(dashboard).toContain("Lương giả lập");
      expect(dashboard).toContain("Ăn uống giả lập");
      expect(dashboard).toContain("Tiết kiệm giả lập");
    },
    60_000,
  );

  it(
    "creates and updates debts through authenticated HTTP server actions",
    async () => {
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.goto(`${dashboardUrl}/login`);
        await page.getByLabel("Email").fill(`${ownerId}@example.invalid`);
        await page.getByLabel("Mật khẩu").fill(testPassword);
        await page.getByRole("button", { name: "Đăng nhập" }).click();
        await browserExpect(page).toHaveURL(/\/dashboard$/);

        const anonymousPage = await browser.newPage();
        const anonymousResponse = await anonymousPage.goto(
          `${dashboardUrl}/debts`,
        );
        await browserExpect(anonymousPage).toHaveURL(/\/login$/);
        expect(anonymousResponse?.status()).toBe(200);
        expect(await anonymousPage.locator("body").innerText()).not.toContain(
          "Khoản nợ HTTP giả lập",
        );
        await anonymousPage.close();

        await page.goto(`${dashboardUrl}/debts`);
        await browserExpect(
          page.getByRole("heading", { name: "Quản lý khoản nợ" }),
        ).toBeVisible();
        await page.getByLabel("Tên người vay").first().fill("Khoản nợ HTTP giả lập");
        await page.getByLabel("Loại vay").first().fill("Vay kiểm thử");
        await page.getByLabel("Dư nợ tại ngày chốt (₫)").first().fill("12000");
        await page.getByLabel("Ngày chốt dư nợ").first().fill("2026-11-05");
        await page.getByLabel("Ngày đến hạn").first().fill("2026-12-01");
        await page.getByLabel("Gốc trả trong kỳ (₫)").first().fill("800");
        await page.getByLabel("Lãi trả trong kỳ (₫)").first().fill("200");
        await page.getByLabel("Tổng phải trả mỗi kỳ (₫)").first().fill("1000");
        await page.getByRole("button", { name: "Thêm khoản nợ" }).click();
        await browserExpect(page.getByRole("status")).toHaveText(
          "Đã thêm khoản nợ.",
        );

        const debtCard = page
          .locator(".debt-card")
          .filter({ hasText: "Khoản nợ HTTP giả lập" });
        await browserExpect(debtCard).toContainText("12.000 ₫");
        await browserExpect(debtCard).toContainText("1.000 ₫");
        await debtCard.getByRole("button", { name: "Sửa" }).click();
        await debtCard.getByLabel("Tên người vay").fill("Khoản nợ HTTP đã sửa");
        await debtCard.getByLabel("Dư nợ tại ngày chốt (₫)").fill("10000");
        await debtCard
          .getByLabel("Lãi trả trong kỳ (₫)")
          .fill("150");
        await debtCard
          .getByLabel("Tổng phải trả mỗi kỳ (₫)")
          .fill("950");
        await debtCard.getByRole("button", { name: "Lưu thay đổi" }).click();
        await browserExpect(
          page.getByText("Đã cập nhật khoản nợ.", { exact: true }),
        ).toBeVisible();
        const updatedDebtCard = page
          .locator(".debt-card")
          .filter({ hasText: "Khoản nợ HTTP đã sửa" });
        await browserExpect(updatedDebtCard).toContainText(
          "Khoản nợ HTTP đã sửa",
        );
        await browserExpect(updatedDebtCard).toContainText("10.000 ₫");
        await browserExpect(updatedDebtCard).toContainText("950 ₫");
      } finally {
        await browser.close();
      }
    },
    90_000,
  );
});
