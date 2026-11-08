import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  calculateDashboardSummary,
  previousMonth,
  type DashboardInput,
} from "@/features/dashboard/dashboard.service";

async function loadFixture(): Promise<DashboardInput> {
  const contents = await readFile(
    join(process.cwd(), "tests/fixtures/finance/dashboard.json"),
    "utf8",
  );
  return JSON.parse(contents) as DashboardInput;
}

describe("dashboard summary", () => {
  it("aggregates current and previous periods without losing integer precision", async () => {
    const summary = calculateDashboardSummary(await loadFixture());

    expect(summary.month).toBe("2026-11");
    expect(summary.previousMonth.month).toBe("2026-10");
    expect(summary.currentMonth.income).toBe("9007199254740990");
    expect(summary.currentMonth.expenses).toBe("250");
    expect(summary.currentMonth.monthlySavings).toBe("200");
    expect(summary.previousMonth.income).toBe("500");
    expect(summary.previousMonth.expenses).toBe("350");
    expect(summary.previousMonth.monthlySavings).toBe("100");
  });

  it("groups signed category totals and calculates net worth from assets minus debt", async () => {
    const summary = calculateDashboardSummary(await loadFixture());

    expect(summary.currentMonth.incomeByCategory).toEqual([
      { categoryId: "salary", categoryName: "Lương", amount: "9007199254740990" },
    ]);
    expect(summary.currentMonth.expensesByCategory).toEqual([
      { categoryId: "food", categoryName: "Ăn uống", amount: "50" },
      {
        categoryId: "saving",
        categoryName: "Tiết kiệm gửi mẹ",
        amount: "200",
      },
    ]);
    expect(summary.netWorth).toBe("3600");
  });

  it("uses the previous calendar month across year boundaries", () => {
    expect(previousMonth("2026-01")).toBe("2025-12");
  });
});
