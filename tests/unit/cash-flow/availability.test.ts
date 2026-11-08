import { describe, expect, it } from "vitest";
import {
  calculateMonthlyOpeningBalance,
  calculateWeeklyAvailability,
  resolveCashFlowEvents,
  type CashFlowEvent,
} from "@/features/cash-flow/availability";

function event(overrides: Partial<CashFlowEvent> = {}): CashFlowEvent {
  return {
    id: "event-1",
    date: "2026-04-01",
    kind: "income",
    amount: 100n,
    source: "transaction",
    ...overrides,
  };
}

describe("weekly cash-flow availability", () => {
  it("sums the three asset kinds entered at the month's opening", () => {
    expect(
      calculateMonthlyOpeningBalance([
        { kind: "cash", amount: 1_000n },
        { kind: "savings_deposit", amount: 2_000n },
        { kind: "cash_equivalent", amount: 3_000n },
      ]),
    ).toEqual({ amount: 6_000n, complete: true });
    expect(
      calculateMonthlyOpeningBalance([
        { kind: "cash", amount: 1_000n },
        { kind: "savings_deposit", amount: 2_000n },
      ]),
    ).toEqual({ amount: 3_000n, complete: false });
  });

  it("uses each month's opening balance for the month portion of a crossing week", () => {
    const result = calculateWeeklyAvailability({
      fromInclusive: "2026-03-30",
      toExclusive: "2026-04-06",
      openingBalances: {
        "2026-03": { amount: 1_000n, complete: true },
        "2026-04": { amount: 2_000n, complete: true },
      },
      events: [
        event({ id: "march-income", date: "2026-03-31", amount: 500n }),
        event({
          id: "april-expense",
          date: "2026-04-01",
          kind: "expense",
          amount: 300n,
        }),
        event({
          id: "april-income",
          date: "2026-04-05",
          amount: 400n,
        }),
      ],
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.weekStart).toBe("2026-03-30");
    expect(
      result[0]?.segments.map((segment) => [
        segment.month,
        segment.openingBalance,
        segment.income,
        segment.expenses,
        segment.closingBalance,
      ]),
    ).toEqual([
      ["2026-03", "1000", "500", "0", "1500"],
      ["2026-04", "2000", "400", "300", "2100"],
    ]);
  });

  it("carries a week's closing balance forward within the same month", () => {
    const result = calculateWeeklyAvailability({
      fromInclusive: "2026-04-01",
      toExclusive: "2026-04-13",
      openingBalances: {
        "2026-03": { amount: 0n, complete: true },
        "2026-04": { amount: 2_000n, complete: true },
      },
      events: [
        event({ id: "first-week", date: "2026-04-02", amount: 500n }),
        event({
          id: "second-week",
          date: "2026-04-08",
          kind: "expense",
          amount: 200n,
        }),
      ],
    });

    const aprilSegments = result.flatMap((week) =>
      week.segments.filter((segment) => segment.month === "2026-04"),
    );
    expect(
      aprilSegments.map((segment) => [
        segment.openingBalance,
        segment.income,
        segment.expenses,
        segment.closingBalance,
      ]),
    ).toEqual([
      ["2000", "500", "0", "2500"],
      ["2500", "0", "200", "2300"],
    ]);
  });

  it("replaces a planned occurrence with its matched actual amount", () => {
    const planned = event({
      id: "planned-salary",
      date: "2026-04-26",
      amount: 10_000n,
      source: "planned",
      scheduleId: "salary",
    });
    const actual = event({
      id: "actual-salary",
      date: "2026-04-26",
      amount: 12_500n,
    });
    const events = resolveCashFlowEvents(
      [planned],
      [actual],
      [{ scheduleId: "salary", scheduledOn: "2026-04-26" }],
    );

    const result = calculateWeeklyAvailability({
      fromInclusive: "2026-04-20",
      toExclusive: "2026-04-27",
      openingBalances: {
        "2026-04": { amount: 50_000n, complete: true },
      },
      events,
    });

    expect(events).toEqual([actual]);
    expect(result.flatMap((week) => week.segments)[0]?.closingBalance).toBe(
      "62500",
    );
  });

  it("subtracts the full principal and interest debt payment", () => {
    const result = calculateWeeklyAvailability({
      fromInclusive: "2026-04-01",
      toExclusive: "2026-04-06",
      openingBalances: {
        "2026-03": { amount: 0n, complete: true },
        "2026-04": { amount: 5_000n, complete: true },
      },
      events: [
        event({
          id: "debt-payment",
          date: "2026-04-03",
          kind: "expense",
          amount: 1_250n,
          source: "debt_payment",
        }),
      ],
    });

    expect(
      result
        .flatMap((week) => week.segments)
        .find((segment) => segment.month === "2026-04")?.closingBalance,
    ).toBe("3750");
  });
});
