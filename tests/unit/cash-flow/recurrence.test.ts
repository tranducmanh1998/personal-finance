import { describe, expect, it } from "vitest";
import { getScheduleOccurrences } from "@/features/cash-flow/recurrence";

type TestSchedule = Readonly<{
  id: string;
  kind: "income" | "expense";
  amount: string;
  description: string;
  scheduledOn: string;
  recurrence: "once" | "weekly" | "monthly";
  endDate?: string | null;
}>;

function schedule(overrides: Partial<TestSchedule> = {}): TestSchedule {
  return {
    id: "schedule-1",
    kind: "income" as const,
    amount: "1000",
    description: "Khoản thu giả lập",
    scheduledOn: "2026-11-01",
    recurrence: "weekly" as const,
    ...overrides,
  };
}

describe("cash-flow schedule recurrence", () => {
  it("plans a Sunday sales income on each Sunday without creating transactions", () => {
    const occurrences = getScheduleOccurrences(
      [schedule({ description: "Thu bán hàng Chủ Nhật" })],
      "2026-11-01",
      "2026-12-01",
    );

    expect(occurrences.map(({ scheduledOn }) => scheduledOn)).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
      "2026-11-22",
      "2026-11-29",
    ]);
  });

  it("plans a salary on the 26th of each month and excludes the next month boundary", () => {
    const occurrences = getScheduleOccurrences(
      [
        schedule({
          scheduledOn: "2026-01-26",
          recurrence: "monthly",
          description: "Lương ngày 26",
        }),
      ],
      "2026-01-01",
      "2026-04-01",
    );

    expect(occurrences.map(({ scheduledOn }) => scheduledOn)).toEqual([
      "2026-01-26",
      "2026-02-26",
      "2026-03-26",
    ]);
  });

  it("skips monthly dates that do not exist instead of moving them", () => {
    const occurrences = getScheduleOccurrences(
      [
        schedule({
          scheduledOn: "2026-01-31",
          recurrence: "monthly",
        }),
      ],
      "2026-01-01",
      "2026-05-01",
    );

    expect(occurrences.map(({ scheduledOn }) => scheduledOn)).toEqual([
      "2026-01-31",
      "2026-03-31",
    ]);
  });

  it("keeps one-time items on their saved date only", () => {
    const occurrences = getScheduleOccurrences(
      [schedule({ recurrence: "once" })],
      "2026-11-01",
      "2026-12-01",
    );

    expect(occurrences.map(({ scheduledOn }) => scheduledOn)).toEqual([
      "2026-11-01",
    ]);
  });

  it("stops a weekly schedule after its inclusive end date", () => {
    const occurrences = getScheduleOccurrences(
      [schedule({ endDate: "2026-11-15" })],
      "2026-11-01",
      "2026-12-01",
    );

    expect(occurrences.map(({ scheduledOn }) => scheduledOn)).toEqual([
      "2026-11-01",
      "2026-11-08",
      "2026-11-15",
    ]);
  });
});
