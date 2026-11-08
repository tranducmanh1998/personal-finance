import type { ScheduleRecurrence } from "@/db/schema/cash-flow";

export type RecurringSchedule = Readonly<{
  id: string;
  scheduledOn: string;
  recurrence: ScheduleRecurrence;
  endDate?: string | null;
}>;

export type ScheduleOccurrence<
  T extends RecurringSchedule = RecurringSchedule,
> = Readonly<{
  item: T;
  scheduledOn: string;
}>;

function parseDate(value: string): Date {
  const date = new Date(`${value}T00:00:00.000Z`);
  if (
    !Number.isFinite(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new RangeError(`Invalid schedule date: ${value}`);
  }
  return date;
}

function dateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getScheduleOccurrences<T extends RecurringSchedule>(
  items: readonly T[],
  fromInclusive: string,
  toExclusive: string,
): readonly ScheduleOccurrence<T>[] {
  const from = parseDate(fromInclusive);
  const to = parseDate(toExclusive);
  if (from >= to) return [];

  const occurrences: ScheduleOccurrence<T>[] = [];
  for (const item of items) {
    const anchor = parseDate(item.scheduledOn);
    const endDate = item.endDate ? parseDate(item.endDate) : null;
    if (endDate && endDate < anchor) continue;
    if (item.recurrence === "once") {
      if (
        item.scheduledOn >= fromInclusive &&
        item.scheduledOn < toExclusive &&
        (!endDate || anchor <= endDate)
      ) {
        occurrences.push({ item, scheduledOn: item.scheduledOn });
      }
      continue;
    }

    if (item.recurrence === "weekly") {
      const occurrence = new Date(from);
      const weekdayOffset = (anchor.getUTCDay() - from.getUTCDay() + 7) % 7;
      occurrence.setUTCDate(occurrence.getUTCDate() + weekdayOffset);
      while (occurrence < anchor) {
        occurrence.setUTCDate(occurrence.getUTCDate() + 7);
      }
      while (occurrence < to && (!endDate || occurrence <= endDate)) {
        occurrences.push({ item, scheduledOn: dateString(occurrence) });
        occurrence.setUTCDate(occurrence.getUTCDate() + 7);
      }
      continue;
    }

    let monthStart = new Date(`${fromInclusive.slice(0, 7)}-01T00:00:00.000Z`);
    while (monthStart < to) {
      const nextMonthStart = new Date(monthStart);
      nextMonthStart.setUTCMonth(nextMonthStart.getUTCMonth() + 1);
      const lastDay = new Date(nextMonthStart.getTime() - 86_400_000);
      const day = anchor.getUTCDate();
      if (day <= lastDay.getUTCDate()) {
        const scheduledOn = `${dateString(monthStart).slice(0, 7)}-${String(day).padStart(2, "0")}`;
        if (
          scheduledOn >= item.scheduledOn &&
          scheduledOn >= fromInclusive &&
          scheduledOn < toExclusive &&
          (!endDate || scheduledOn <= dateString(endDate))
        ) {
          occurrences.push({ item, scheduledOn });
        }
      }
      monthStart = nextMonthStart;
    }
  }

  return occurrences.sort(
    (first, second) =>
      first.scheduledOn.localeCompare(second.scheduledOn) ||
      first.item.id.localeCompare(second.item.id),
  );
}
