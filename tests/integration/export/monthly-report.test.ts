import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { user } from "@/db/schema/auth";
import { monthlyHistorySnapshot, historyTransactionSnapshot, historyDebtSnapshot } from "@/db/schema/history";

const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
const db = drizzle(pool);
const owner = randomUUID();
const other = randomUUID();
let originalDatabaseUrl: string | undefined;

beforeAll(async () => {
  originalDatabaseUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  await migrate(db, { migrationsFolder: "drizzle" });
  await db.insert(user).values([owner, other].map((id) => ({ id, name: "Synthetic Export", email: `${id}@example.invalid`, emailVerified: false, createdAt: new Date(), updatedAt: new Date() })));
});
afterAll(async () => {
  try { await db.delete(user).where(eq(user.id, owner)); await db.delete(user).where(eq(user.id, other)); }
  finally {
    if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalDatabaseUrl;
    await pool.end();
  }
});
it("exports only the owner's closed snapshot and preserves exact amounts and missing debt anchors", async () => {
  const { createMonthlyReport } = await import("@/features/export/monthly-report");
  const [snapshot] = await db.insert(monthlyHistorySnapshot).values({ userId: owner, month: "2020-01", periodStart: "2020-01-01", periodEndExclusive: "2020-02-01", closeKind: "backfill", incomeTotal: 9007199254740993n, expenseTotal: 0n, knownDebtTotal: 0n, unresolvedDebtCount: 1 }).returning();
  await db.insert(historyTransactionSnapshot).values({ snapshotId: snapshot.id, sourceTransactionId: randomUUID(), occurredOn: "2020-01-02", kind: "income", amount: 9007199254740993n, categoryId: randomUUID(), categoryName: "=Synthetic category", description: "+Synthetic description", isDebtPayment: false });
  await db.insert(historyDebtSnapshot).values({ snapshotId: snapshot.id, sourceDebtId: randomUUID(), borrowerName: "Synthetic debt", loanType: "Test", balanceAsOf: "2020-02-01", closingBalance: null, balanceStatus: "insufficient_history" });
  expect(await createMonthlyReport(other, "2020-01")).toBeNull();
  expect(await createMonthlyReport(owner, "2020-02")).toBeNull();
  const buffer = await createMonthlyReport(owner, "2020-01");
  expect(buffer).not.toBeNull();
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer!);
  expect(book.getWorksheet("Thu chi")!.getCell("D2").value).toBe("9007199254740993");
  expect(book.getWorksheet("Thu chi")!.getCell("C2").value).toBe("=Synthetic category");
  expect(book.getWorksheet("Dư nợ cuối tháng")!.getCell("D2").value).toBe("");
  expect(book.getWorksheet("Dư nợ cuối tháng")!.getCell("E2").value).toBe("Thiếu lịch sử");
});
