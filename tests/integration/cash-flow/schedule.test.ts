import { randomUUID } from "node:crypto";
import { cp, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { tmpdir } from "node:os";
import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { chromium, expect as browserExpect } from "@playwright/test";
import { hashPassword } from "better-auth/crypto";
import { and, eq, or } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { closeDb, getDb, type Database } from "@/db";
import { account, user } from "@/db/schema/auth";
import { assetBalance } from "@/db/schema/assets";
import {
  cashFlowOccurrenceMatch,
  cashFlowSchedule,
} from "@/db/schema/cash-flow";
import { category } from "@/db/schema/categories";
import { debtPayment } from "@/db/schema/debt-payments";
import { debt } from "@/db/schema/debts";
import { transaction } from "@/db/schema/finance";
import { assertIsolatedTestDatabase } from "@/db/test-database-guard";
import {
  createScheduleItem,
  deleteScheduleItem,
  listScheduleItems,
  updateScheduleItem,
} from "@/features/cash-flow/schedule.service";
import { getMonthlyAvailability } from "@/features/cash-flow/availability.service";

const testPassword = "cash-flow-integration-test-password";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const applicationDatabaseUrl = process.env.DATABASE_URL;
let db: Database;
let ownerId: string;
let otherOwnerId: string;
let originalDatabaseUrl: string | undefined;
let server: ChildProcess | undefined;
let serverError: Error | undefined;
let serverUrl: string;
let serverProjectDir: string | undefined;
let today: string;
let otherScheduleItemId: string;

function scheduleInput(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    kind: "expense",
    amount: "9007199254740993",
    scheduledOn: today,
    description: "Chi phí dự kiến giả lập",
    ...overrides,
  };
}

function currentMonthSundays(): readonly Readonly<{
  date: string;
  day: number;
}>[] {
  const monthStart = new Date(`${today.slice(0, 7)}-01T00:00:00.000Z`);
  const monthEnd = new Date(monthStart);
  monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const sunday = new Date(monthStart);
  sunday.setUTCDate(sunday.getUTCDate() + ((7 - sunday.getUTCDay()) % 7));
  const dates: { date: string; day: number }[] = [];
  while (sunday < monthEnd) {
    dates.push({
      date: sunday.toISOString().slice(0, 10),
      day: sunday.getUTCDate(),
    });
    sunday.setUTCDate(sunday.getUTCDate() + 7);
  }
  return dates;
}

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => resolve());
  });
  const address = listener.address();
  if (!address || typeof address === "string") {
    throw new Error("Could not allocate a port for the cash-flow test server.");
  }
  await new Promise<void>((resolve, reject) => {
    listener.close((error) => (error ? reject(error) : resolve()));
  });
  return address.port;
}

async function createTestServerProject(): Promise<string> {
  const projectDir = await mkdtemp(
    join(tmpdir(), "personal-finance-cash-flow-"),
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
  await writeFile(
    join(projectDir, "next.config.ts"),
    `import config from ${JSON.stringify(resolve(process.cwd(), "next.config.ts"))};\nexport default { ...config, distDir: ".next" };\n`,
  );
  return projectDir;
}

async function startTestServer(): Promise<void> {
  const port = await availablePort();
  serverProjectDir = await createTestServerProject();
  serverUrl = `http://127.0.0.1:${port}`;
  server = spawn(
    process.execPath,
    [
      new URL("../../../node_modules/next/dist/bin/next", import.meta.url)
        .pathname,
      "dev",
      serverProjectDir,
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
        BETTER_AUTH_URL: serverUrl,
      },
      stdio: "ignore",
    },
  );
  server.on("error", (error) => {
    serverError = error;
  });

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (serverError) {
      throw new Error("Could not start the cash-flow integration server.", {
        cause: serverError,
      });
    }
    if (server.exitCode !== null) {
      throw new Error("The cash-flow integration server exited early.");
    }
    try {
      const response = await fetch(`${serverUrl}/login`);
      if (response.ok) return;
    } catch {
      await delay(250);
    }
  }
  throw new Error("The cash-flow integration server did not become ready.");
}

async function stopTestServer(): Promise<void> {
  if (!server || server.exitCode !== null) return;
  const child = server;
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5_000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

describe("one-time cash-flow schedule integration", () => {
  beforeAll(async () => {
    assertIsolatedTestDatabase(testDatabaseUrl, applicationDatabaseUrl);
    originalDatabaseUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl;
    db = getDb();
    await migrate(db, { migrationsFolder: "./drizzle" });

    const now = new Date();
    today = now.toISOString().slice(0, 10);
    ownerId = `fake-cash-flow-owner-${randomUUID()}`;
    otherOwnerId = `fake-cash-flow-other-${randomUUID()}`;
    await db.insert(user).values(
      [ownerId, otherOwnerId].map((id) => ({
        id,
        name: "Synthetic cash-flow user",
        email: `${id}@example.invalid`,
        createdAt: now,
        updatedAt: now,
      })),
    );
    await db.insert(account).values({
      id: randomUUID(),
      accountId: ownerId,
      providerId: "credential",
      userId: ownerId,
      password: await hashPassword(testPassword),
      createdAt: now,
      updatedAt: now,
    });
    await startTestServer();
  }, 120_000);

  afterAll(async () => {
    await stopTestServer();
    if (serverProjectDir) {
      await rm(serverProjectDir, { recursive: true, force: true });
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

  it("supports exact CRUD, validates dates and amounts, and isolates users", async () => {
    const otherItem = await createScheduleItem(
      otherOwnerId,
      scheduleInput({ amount: "777", kind: "income" }),
    );
    otherScheduleItemId = otherItem.id;
    const first = await createScheduleItem(ownerId, scheduleInput());
    const second = await createScheduleItem(
      ownerId,
      scheduleInput({
        kind: "income",
        amount: "100",
        description: "Khoản thu dự kiến giả lập",
        scheduledOn: "2026-12-01",
      }),
    );

    expect(await listScheduleItems(ownerId)).toHaveLength(2);
    expect(await listScheduleItems(otherOwnerId)).toEqual([
      expect.objectContaining({ id: otherItem.id }),
    ]);
    expect(first).toMatchObject({
      amount: "9007199254740993",
      kind: "expense",
      scheduledOn: today,
    });
    expect(
      await updateScheduleItem(ownerId, otherItem.id, scheduleInput()),
    ).toBeNull();
    expect(await deleteScheduleItem(ownerId, otherItem.id)).toBe(false);
    await expect(
      createScheduleItem(ownerId, scheduleInput({ amount: "-1" })),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createScheduleItem(
        ownerId,
        scheduleInput({ amount: "9223372036854775808" }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createScheduleItem(ownerId, scheduleInput({ scheduledOn: "2026-02-30" })),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
    await expect(
      createScheduleItem(ownerId, scheduleInput({ kind: "transfer" })),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });

    const updated = await updateScheduleItem(
      ownerId,
      first.id,
      scheduleInput({
        amount: "42",
        kind: "income",
        scheduledOn: "2026-12-31",
        description: "Đã sửa khoản dự kiến",
      }),
    );
    expect(updated).toMatchObject({
      amount: "42",
      kind: "income",
      scheduledOn: "2026-12-31",
      description: "Đã sửa khoản dự kiến",
    });
    expect(await deleteScheduleItem(ownerId, second.id)).toBe(true);
    expect(await listScheduleItems(ownerId)).toEqual([
      expect.objectContaining({ id: first.id }),
    ]);
    expect(
      await db
        .select({ id: transaction.id })
        .from(transaction)
        .where(eq(transaction.userId, ownerId)),
    ).toHaveLength(0);
    expect(
      await db
        .select({ id: cashFlowSchedule.id })
        .from(cashFlowSchedule)
        .where(
          and(
            eq(cashFlowSchedule.id, otherItem.id),
            eq(cashFlowSchedule.userId, otherOwnerId),
          ),
        ),
    ).toHaveLength(1);
  });

  it("creates, edits, and deletes a planned item through the authenticated UI", async () => {
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: { width: 1280, height: 900 },
      });
      const unauthenticatedResponse = await fetch(`${serverUrl}/api/cash-flow`);
      expect(unauthenticatedResponse.status).toBe(401);
      const signInResponse = await fetch(
        `${serverUrl}/api/auth/sign-in/email`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            origin: serverUrl,
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
            url: serverUrl,
          };
        });
      expect(cookies.length).toBeGreaterThan(0);
      await page.context().addCookies(cookies);
      await page.goto(`${serverUrl}/cash-flow`);
      await browserExpect(
        page.getByRole("heading", { name: "Dòng tiền dự kiến" }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole("link", { name: "Dòng tiền" }),
      ).toBeVisible();
      await browserExpect(
        page.getByRole("heading", { name: "Số dư khả dụng theo tuần" }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 390, height: 844 });
      const foreignUpdateStatus = await page.evaluate(async (itemId) => {
        const response = await fetch(`/api/cash-flow/${itemId}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            kind: "income",
            amount: "1",
            scheduledOn: "2026-12-01",
            description: "Không được sửa khoản của user khác",
          }),
        });
        return response.status;
      }, otherScheduleItemId);
      expect(foreignUpdateStatus).toBe(404);

      const form = page.locator("form.schedule-form");
      await form.getByLabel("Loại khoản dự kiến").selectOption("income");
      await form.getByLabel("Ngày dự kiến").fill("2026-12-15");
      await form.getByLabel("Số tiền (₫)").fill("12345678901234567");
      await form.getByLabel("Mô tả").fill("Thu nhập dự kiến qua giao diện");
      await form.getByRole("button", { name: "Thêm khoản dự kiến" }).click();
      const item = page
        .locator(".schedule-section .schedule-card")
        .filter({ hasText: "Thu nhập dự kiến qua giao diện" });
      await browserExpect(item).toContainText("12.345.678.901.234.567 ₫");
      await browserExpect(item).toContainText("Thu dự kiến");

      const sundays = currentMonthSundays();
      const [firstSunday] = sundays;
      if (!firstSunday) {
        throw new Error("The current month has no Sunday.");
      }
      const monthStart = `${today.slice(0, 7)}-01`;
      const [incomeCategory] = await db
        .insert(category)
        .values({
          userId: ownerId,
          name: "Dữ liệu giả thu dòng tiền",
          kind: "income",
        })
        .returning({ id: category.id });
      const [expenseCategory] = await db
        .insert(category)
        .values({
          userId: ownerId,
          name: "Dữ liệu giả chi dòng tiền",
          kind: "expense",
        })
        .returning({ id: category.id });
      if (!incomeCategory || !expenseCategory) {
        throw new Error("Could not create synthetic transaction categories.");
      }
      const [saleTransaction] = await db
        .insert(transaction)
        .values({
          userId: ownerId,
          categoryId: incomeCategory.id,
          kind: "income",
          amount: 12_500n,
          occurredOn: firstSunday.date,
          description: "Doanh thu bán hàng thực nhận",
        })
        .returning({ id: transaction.id });
      const [fakeDebt] = await db
        .insert(debt)
        .values({
          userId: ownerId,
          borrowerName: "Khoản nợ giả lập",
          loanType: "test",
          balanceAsOf: today,
          balanceAmount: 100_000n,
          dueDate: null,
          principalDuePerPeriod: 9_000n,
          interestDuePerPeriod: 1_000n,
          paymentDuePerPeriod: 10_000n,
          finalPeriod: null,
        })
        .returning({ id: debt.id });
      const [paymentTransaction] = await db
        .insert(transaction)
        .values({
          userId: ownerId,
          categoryId: expenseCategory.id,
          kind: "expense",
          amount: 10_000n,
          occurredOn: firstSunday.date,
          description: "Thanh toán nợ giả lập",
        })
        .returning({ id: transaction.id });
      if (!saleTransaction || !fakeDebt || !paymentTransaction) {
        throw new Error("Could not create synthetic matched actuals.");
      }
      const [fakePayment] = await db
        .insert(debtPayment)
        .values({
          userId: ownerId,
          debtId: fakeDebt.id,
          transactionId: paymentTransaction.id,
          period: today.slice(0, 7),
          paidOn: firstSunday.date,
          principalAmount: 9_000n,
          interestAmount: 1_000n,
        })
        .returning({ id: debtPayment.id });
      if (!fakePayment) {
        throw new Error("Could not create the synthetic debt payment.");
      }
      await db.insert(assetBalance).values([
        {
          userId: ownerId,
          kind: "cash",
          amount: 100_000n,
          asOfDate: monthStart,
        },
        {
          userId: ownerId,
          kind: "savings_deposit",
          amount: 20_000n,
          asOfDate: monthStart,
        },
        {
          userId: ownerId,
          kind: "cash_equivalent",
          amount: 5_000n,
          asOfDate: monthStart,
        },
      ]);
      await form.getByLabel("Loại khoản dự kiến").selectOption("income");
      await form.getByLabel("Ngày dự kiến").fill(firstSunday.date);
      await form.getByLabel("Lặp lại").selectOption("weekly");
      const lastSunday = sundays.at(-1);
      if (!lastSunday)
        throw new Error("The current month has no final Sunday.");
      await form.getByLabel("Số tiền (₫)").fill("2500");
      await form.getByLabel("Mô tả").fill("Thu bán hàng Chủ Nhật");
      await form.getByRole("button", { name: "Thêm khoản dự kiến" }).click();
      const sundaySales = page
        .locator(".schedule-section .schedule-card")
        .filter({ hasText: "Thu bán hàng Chủ Nhật" });
      await browserExpect(sundaySales).toContainText("hằng tuần");
      await sundaySales.getByRole("button", { name: "Sửa" }).click();
      const sundayEditForm = sundaySales.locator("form.schedule-edit-form");
      await sundayEditForm
        .getByLabel("Ngày kết thúc lặp (không bắt buộc)")
        .fill(lastSunday.date);
      await sundayEditForm
        .getByRole("button", { name: "Lưu thay đổi" })
        .click();
      await browserExpect(sundaySales).toContainText(
        `đến hết ${new Intl.DateTimeFormat("vi-VN", {
          weekday: "long",
          day: "numeric",
          month: "long",
          year: "numeric",
        }).format(new Date(`${lastSunday.date}T00:00:00`))}`,
      );
      await browserExpect(sundaySales).toContainText(
        sundays.map(({ day }) => day).join(", "),
      );
      const saleOccurrence = page.locator(".availability-occurrence").filter({
        has: page.getByLabel(
          `Giao dịch thực tế cho Thu bán hàng Chủ Nhật ngày ${firstSunday.date}`,
        ),
      });
      await browserExpect(saleOccurrence).toBeVisible();
      await saleOccurrence
        .getByLabel(/^Giao dịch thực tế cho Thu bán hàng/)
        .selectOption(`transaction:${saleTransaction.id}`);
      await saleOccurrence
        .getByRole("button", { name: "Khớp thực tế" })
        .click();
      await browserExpect(saleOccurrence).toContainText(
        "Đã thay bằng thực tế: 12.500 ₫",
      );

      await form.getByLabel("Ngày dự kiến").fill(`${today.slice(0, 7)}-26`);
      await form.getByLabel("Lặp lại").selectOption("monthly");
      await form.getByLabel("Số tiền (₫)").fill("15000000");
      await form.getByLabel("Mô tả").fill("Lương ngày 26");
      await form.getByRole("button", { name: "Thêm khoản dự kiến" }).click();
      const monthlySalary = page
        .locator(".schedule-section .schedule-card")
        .filter({ hasText: "Lương ngày 26" });
      await browserExpect(monthlySalary).toContainText("hằng tháng ngày 26");
      await browserExpect(monthlySalary).toContainText(
        "Ngày dự kiến trong tháng: 26",
      );
      await browserExpect(
        page
          .locator(".availability-occurrence")
          .filter({ hasText: "Lương ngày 26" }),
      ).toBeVisible();

      await form.getByLabel("Loại khoản dự kiến").selectOption("expense");
      await form.getByLabel("Ngày dự kiến").fill(firstSunday.date);
      await form.getByLabel("Lặp lại").selectOption("once");
      await form.getByLabel("Số tiền (₫)").fill("9000");
      await form.getByLabel("Mô tả").fill("Khoản trả nợ dự kiến");
      await form.getByRole("button", { name: "Thêm khoản dự kiến" }).click();
      const debtOccurrence = page
        .locator(".availability-occurrence")
        .filter({ hasText: "Khoản trả nợ dự kiến" });
      await browserExpect(debtOccurrence).toBeVisible();
      await debtOccurrence
        .getByLabel(/^Giao dịch thực tế cho Khoản trả nợ/)
        .selectOption(`debt_payment:${fakePayment.id}`);
      await debtOccurrence
        .getByRole("button", { name: "Khớp thực tế" })
        .click();
      await browserExpect(debtOccurrence).toContainText(
        "Đã thay bằng thực tế: 10.000 ₫",
      );
      const forecast = await getMonthlyAvailability(ownerId, today.slice(0, 7));
      const matchedWeek = forecast.weeks.find(
        (week) =>
          week.weekStart <= firstSunday.date &&
          week.weekEnd >= firstSunday.date,
      );
      const matchedSegment = matchedWeek?.segments.find(
        (segment) => segment.month === today.slice(0, 7),
      );
      expect(matchedSegment).toMatchObject({
        openingBalance: "125000",
        income: "12500",
        expenses: "10000",
        debtPayments: "10000",
        closingBalance: "127500",
      });

      expect(
        await page.evaluate(
          () =>
            document.documentElement.scrollWidth <=
            document.documentElement.clientWidth,
        ),
      ).toBe(true);
      expect(
        await db
          .select({ id: transaction.id })
          .from(transaction)
          .where(eq(transaction.userId, ownerId)),
      ).toHaveLength(2);
      expect(
        await db
          .select({ id: cashFlowOccurrenceMatch.id })
          .from(cashFlowOccurrenceMatch)
          .where(eq(cashFlowOccurrenceMatch.userId, ownerId)),
      ).toHaveLength(2);

      const [createdItem] = await db
        .select({ id: cashFlowSchedule.id })
        .from(cashFlowSchedule)
        .where(
          and(
            eq(cashFlowSchedule.userId, ownerId),
            eq(cashFlowSchedule.description, "Thu nhập dự kiến qua giao diện"),
          ),
        );
      if (!createdItem) {
        throw new Error(
          "The UI-created cash-flow schedule item was not saved.",
        );
      }

      await item.getByRole("button", { name: "Sửa" }).click();
      const editForm = item.locator("form.schedule-edit-form");
      await editForm.getByLabel("Mô tả").fill("Thu đã cập nhật");
      const updateResponsePromise = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/cash-flow/${createdItem.id}`) &&
          response.request().method() === "PUT",
      );
      await editForm.getByRole("button", { name: "Lưu thay đổi" }).click();
      const updateResponse = await updateResponsePromise;
      expect(updateResponse.status()).toBe(200);
      const updatedItem = page
        .locator(".schedule-section .schedule-card")
        .filter({ hasText: "Thu đã cập nhật" });
      await browserExpect(updatedItem).toBeVisible();

      page.once("dialog", async (dialog) => {
        expect(dialog.message()).toContain("Xóa khoản dự kiến");
        await dialog.dismiss();
      });
      await updatedItem.getByRole("button", { name: "Xóa" }).click();
      await browserExpect(updatedItem).toBeVisible();
      page.once("dialog", async (dialog) => {
        await dialog.accept();
      });
      await updatedItem.getByRole("button", { name: "Xóa" }).click();
      await browserExpect(updatedItem).toHaveCount(0);
    } finally {
      await browser.close();
    }
  }, 90_000);
});
