export type CashFlowEvent = Readonly<{
  id: string;
  date: string;
  kind: "income" | "expense";
  amount: bigint;
  source: "planned" | "transaction" | "debt_payment";
  scheduleId?: string;
}>;

export type AvailabilityOpeningBalance = Readonly<{
  amount: bigint;
  complete: boolean;
}>;

export type MonthlyAssetBalance = Readonly<{
  kind: "cash" | "savings_deposit" | "cash_equivalent";
  amount: bigint;
}>;

export type CashFlowMatch = Readonly<{
  scheduleId: string;
  scheduledOn: string;
}>;

export type AvailabilitySegment = Readonly<{
  month: string;
  start: string;
  end: string;
  openingBalance: string;
  income: string;
  expenses: string;
  debtPayments: string;
  closingBalance: string;
  openingBalanceComplete: boolean;
}>;

export type AvailabilityWeek = Readonly<{
  weekStart: string;
  weekEnd: string;
  segments: readonly AvailabilitySegment[];
}>;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`Invalid cash-flow date: ${value}`);
  }
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function monthStart(value: string): Date {
  return new Date(`${value.slice(0, 7)}-01T00:00:00.000Z`);
}

function nextMonthStart(value: string): Date {
  const next = monthStart(value);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

function occurrenceKey(scheduleId: string, scheduledOn: string): string {
  return `${scheduleId}:${scheduledOn}`;
}

export function resolveCashFlowEvents(
  planned: readonly CashFlowEvent[],
  actual: readonly CashFlowEvent[],
  matches: readonly CashFlowMatch[],
): readonly CashFlowEvent[] {
  const matchedOccurrences = new Set(
    matches.map(({ scheduleId, scheduledOn }) =>
      occurrenceKey(scheduleId, scheduledOn),
    ),
  );
  return [
    ...planned.filter(
      (event) =>
        !event.scheduleId ||
        !matchedOccurrences.has(occurrenceKey(event.scheduleId, event.date)),
    ),
    ...actual,
  ].sort(
    (first, second) =>
      first.date.localeCompare(second.date) ||
      first.id.localeCompare(second.id),
  );
}

function signedAmount(event: CashFlowEvent): bigint {
  return event.kind === "income" ? event.amount : -event.amount;
}

export function calculateMonthlyOpeningBalance(
  balances: readonly MonthlyAssetBalance[],
): AvailabilityOpeningBalance {
  const amounts = new Map(balances.map(({ kind, amount }) => [kind, amount]));
  const kinds = ["cash", "savings_deposit", "cash_equivalent"] as const;
  return {
    amount: kinds.reduce(
      (total, kind) => total + (amounts.get(kind) ?? 0n),
      0n,
    ),
    complete: kinds.every((kind) => amounts.has(kind)),
  };
}

export function calculateWeeklyAvailability(
  input: Readonly<{
    fromInclusive: string;
    toExclusive: string;
    openingBalances: Readonly<Record<string, AvailabilityOpeningBalance>>;
    events: readonly CashFlowEvent[];
  }>,
): readonly AvailabilityWeek[] {
  const from = parseDate(input.fromInclusive);
  const to = parseDate(input.toExclusive);
  if (from >= to) return [];

  const firstMonday = new Date(from);
  firstMonday.setUTCDate(
    firstMonday.getUTCDate() - ((firstMonday.getUTCDay() + 6) % 7),
  );
  const finalDay = new Date(to);
  finalDay.setUTCDate(finalDay.getUTCDate() - 1);
  const weeks: AvailabilityWeek[] = [];

  for (
    let weekStart = firstMonday;
    weekStart <= finalDay;
    weekStart = new Date(weekStart.getTime() + 7 * 86_400_000)
  ) {
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
    const segments: AvailabilitySegment[] = [];
    for (
      let segmentStart = new Date(weekStart);
      segmentStart <= weekEnd;
      segmentStart = nextMonthStart(dateString(segmentStart))
    ) {
      const month = dateString(segmentStart).slice(0, 7);
      const monthStartDate = monthStart(month);
      const nextMonth = nextMonthStart(month);
      const start = new Date(
        Math.max(weekStart.getTime(), monthStartDate.getTime()),
      );
      const endExclusive = new Date(
        Math.min(weekEnd.getTime() + 86_400_000, nextMonth.getTime()),
      );
      if (start >= endExclusive) continue;

      const opening = input.openingBalances[month] ?? {
        amount: 0n,
        complete: false,
      };
      let openingBalance = opening.amount;
      for (const event of input.events) {
        if (
          event.date >= dateString(monthStartDate) &&
          event.date < dateString(start)
        ) {
          openingBalance += signedAmount(event);
        }
      }

      const segmentEvents = input.events.filter(
        (event) =>
          event.date >= dateString(start) &&
          event.date < dateString(endExclusive),
      );
      let income = 0n;
      let expenses = 0n;
      let debtPayments = 0n;
      let closingBalance = openingBalance;
      for (const event of segmentEvents) {
        if (event.kind === "income") {
          income += event.amount;
        } else {
          expenses += event.amount;
          if (event.source === "debt_payment") {
            debtPayments += event.amount;
          }
        }
        closingBalance += signedAmount(event);
      }

      segments.push({
        month,
        start: dateString(start),
        end: dateString(new Date(endExclusive.getTime() - 86_400_000)),
        openingBalance: openingBalance.toString(),
        income: income.toString(),
        expenses: expenses.toString(),
        debtPayments: debtPayments.toString(),
        closingBalance: closingBalance.toString(),
        openingBalanceComplete: opening.complete,
      });
    }

    weeks.push({
      weekStart: dateString(weekStart),
      weekEnd: dateString(weekEnd),
      segments,
    });
  }
  return weeks;
}
