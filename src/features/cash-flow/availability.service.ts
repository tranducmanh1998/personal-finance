import { and, asc, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { assetBalance } from "@/db/schema/assets";
import {
  cashFlowOccurrenceMatch,
  cashFlowSchedule,
} from "@/db/schema/cash-flow";
import { debtPayment } from "@/db/schema/debt-payments";
import { transaction } from "@/db/schema/finance";
import {
  calculateMonthlyOpeningBalance,
  calculateWeeklyAvailability,
  resolveCashFlowEvents,
  type CashFlowEvent,
} from "./availability";
import { getScheduleOccurrences } from "./recurrence";
import { z } from "zod";
import { DomainError } from "@/lib/errors";

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.toISOString().slice(0, 10) === value
    );
  });

const matchInputSchema = z.object({
  scheduleId: z.uuid(),
  scheduledOn: dateSchema,
  transactionId: z.uuid().optional(),
  debtPaymentId: z.uuid().optional(),
});

export type AvailabilityOccurrenceDto = Readonly<{
  scheduleId: string;
  scheduledOn: string;
  kind: "income" | "expense";
  amount: string;
  description: string | null;
  matched: Readonly<{
    type: "transaction" | "debt_payment";
    id: string;
    amount: string;
  }> | null;
  candidates: readonly Readonly<{
    type: "transaction" | "debt_payment";
    id: string;
    amount: string;
    description: string | null;
  }>[];
}>;

export type MonthlyAvailabilityDto = Readonly<{
  month: string;
  weeks: ReturnType<typeof calculateWeeklyAvailability>;
  occurrences: readonly AvailabilityOccurrenceDto[];
}>;

function monthStart(value: string): string {
  return `${value}-01`;
}

function nextMonth(value: string): string {
  const date = new Date(`${value}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 7);
}

function mondayOnOrBefore(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

function mondayAfterMonth(value: string): string {
  const lastDay = new Date(`${nextMonth(value)}-01T00:00:00.000Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  lastDay.setUTCDate(
    lastDay.getUTCDate() + (7 - ((lastDay.getUTCDay() + 6) % 7)),
  );
  return lastDay.toISOString().slice(0, 10);
}

function listMonths(from: string, toExclusive: string): string[] {
  const months: string[] = [];
  for (
    let month = from.slice(0, 7);
    `${month}-01` < toExclusive;
    month = nextMonth(month)
  ) {
    months.push(month);
  }
  return months;
}

function occurrenceKey(scheduleId: string, scheduledOn: string): string {
  return `${scheduleId}:${scheduledOn}`;
}

function toDomainError(error: unknown): DomainError {
  if (error instanceof z.ZodError) {
    return new DomainError(
      "INVALID_INPUT",
      error.issues.map((issue) => ({
        field: issue.path.join(".") || "body",
        message: issue.message,
      })),
    );
  }
  return error instanceof DomainError ? error : new DomainError("CONFLICT");
}

function isUniqueViolation(error: unknown): boolean {
  let current = error;
  for (let depth = 0; depth < 4; depth += 1) {
    if (!current || typeof current !== "object") return false;
    const databaseError = current as Readonly<{
      code?: string;
      cause?: unknown;
    }>;
    if (databaseError.code === "23505") return true;
    current = databaseError.cause;
  }
  return false;
}

export async function getMonthlyAvailability(
  userId: string,
  monthInput: unknown,
): Promise<MonthlyAvailabilityDto> {
  const parsedMonth = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .safeParse(monthInput);
  if (!parsedMonth.success) {
    throw new DomainError("INVALID_INPUT", [
      { field: "month", message: "Tháng phải theo định dạng YYYY-MM." },
    ]);
  }

  const month = parsedMonth.data;
  const monthFirst = monthStart(month);
  const rangeStart = mondayOnOrBefore(monthFirst);
  const rangeEnd = mondayAfterMonth(month);
  const openingRangeStart = `${rangeStart.slice(0, 7)}-01`;
  const months = listMonths(openingRangeStart, rangeEnd);
  const db = getDb();

  const scheduleItems = await db
    .select()
    .from(cashFlowSchedule)
    .where(eq(cashFlowSchedule.userId, userId))
    .orderBy(
      asc(cashFlowSchedule.scheduledOn),
      asc(cashFlowSchedule.createdAt),
    );
  const occurrences = getScheduleOccurrences(
    scheduleItems,
    openingRangeStart,
    rangeEnd,
  );
  const [matches, actualRows] = await Promise.all([
    db
      .select()
      .from(cashFlowOccurrenceMatch)
      .where(
        and(
          eq(cashFlowOccurrenceMatch.userId, userId),
          gte(cashFlowOccurrenceMatch.scheduledOn, openingRangeStart),
          lt(cashFlowOccurrenceMatch.scheduledOn, rangeEnd),
        ),
      ),
    db
      .select({
        id: transaction.id,
        kind: transaction.kind,
        amount: transaction.amount,
        date: transaction.occurredOn,
        description: transaction.description,
        debtPaymentId: debtPayment.id,
        principalAmount: debtPayment.principalAmount,
        interestAmount: debtPayment.interestAmount,
      })
      .from(transaction)
      .leftJoin(
        debtPayment,
        and(
          eq(debtPayment.transactionId, transaction.id),
          eq(debtPayment.userId, transaction.userId),
        ),
      )
      .where(
        and(
          eq(transaction.userId, userId),
          gte(transaction.occurredOn, openingRangeStart),
          lt(transaction.occurredOn, rangeEnd),
        ),
      )
      .orderBy(asc(transaction.occurredOn), asc(transaction.createdAt)),
  ]);
  const matchedOccurrences = new Map(
    matches.map((match) => [
      occurrenceKey(match.scheduleId, match.scheduledOn),
      match,
    ]),
  );
  const actualEvents: CashFlowEvent[] = actualRows.map((row) => ({
    id: row.debtPaymentId ?? row.id,
    date: row.date,
    kind: row.debtPaymentId ? "expense" : row.kind,
    amount: row.debtPaymentId
      ? row.principalAmount! + row.interestAmount!
      : row.amount,
    source: row.debtPaymentId ? "debt_payment" : "transaction",
  }));
  const plannedEvents: CashFlowEvent[] = occurrences.map(
    ({ item, scheduledOn }) => ({
      id: `${item.id}:${scheduledOn}`,
      date: scheduledOn,
      kind: item.kind,
      amount: item.amount,
      source: "planned",
      scheduleId: item.id,
    }),
  );
  const effectiveEvents = resolveCashFlowEvents(
    plannedEvents,
    actualEvents,
    matches,
  );
  const openingBalances: Record<
    string,
    Readonly<{ amount: bigint; complete: boolean }>
  > = {};
  for (const openingMonth of months) {
    const rows = await db
      .select({
        kind: assetBalance.kind,
        amount: assetBalance.amount,
      })
      .from(assetBalance)
      .where(
        and(
          eq(assetBalance.userId, userId),
          eq(assetBalance.asOfDate, monthStart(openingMonth)),
        ),
      );
    openingBalances[openingMonth] = calculateMonthlyOpeningBalance(rows);
  }

  const optionsById = new Map(
    actualRows.map((row) => [
      row.debtPaymentId ?? row.id,
      {
        type: row.debtPaymentId
          ? ("debt_payment" as const)
          : ("transaction" as const),
        id: row.debtPaymentId ?? row.id,
        kind: row.debtPaymentId ? "expense" : row.kind,
        date: row.date,
        amount: row.debtPaymentId
          ? (row.principalAmount! + row.interestAmount!).toString()
          : row.amount.toString(),
        description: row.description,
      },
    ]),
  );
  const usedActuals = new Set(
    matches.flatMap((match) => [
      ...(match.transactionId ? [match.transactionId] : []),
      ...(match.debtPaymentId ? [match.debtPaymentId] : []),
    ]),
  );
  const occurrenceDtos: AvailabilityOccurrenceDto[] = occurrences
    .filter(
      ({ scheduledOn }) =>
        scheduledOn >= monthFirst && scheduledOn < `${nextMonth(month)}-01`,
    )
    .map(({ item, scheduledOn }) => {
      const match = matchedOccurrences.get(occurrenceKey(item.id, scheduledOn));
      const matchedId = match?.transactionId ?? match?.debtPaymentId;
      const candidates = [...optionsById.values()]
        .filter(
          (actual) =>
            actual.date === scheduledOn &&
            actual.kind === item.kind &&
            !usedActuals.has(actual.id),
        )
        .map(({ type, id, amount, description }) => ({
          type,
          id,
          amount,
          description,
        }));
      const matched = matchedId ? optionsById.get(matchedId) : undefined;
      return {
        scheduleId: item.id,
        scheduledOn,
        kind: item.kind,
        amount: item.amount.toString(),
        description: item.description,
        matched: matched
          ? { type: matched.type, id: matched.id, amount: matched.amount }
          : null,
        candidates,
      };
    });

  return {
    month,
    weeks: calculateWeeklyAvailability({
      fromInclusive: rangeStart,
      toExclusive: rangeEnd,
      openingBalances,
      events: effectiveEvents,
    }),
    occurrences: occurrenceDtos,
  };
}

export async function setOccurrenceMatch(
  userId: string,
  input: unknown,
): Promise<void> {
  const parsed = matchInputSchema.safeParse(input);
  if (!parsed.success) {
    throw toDomainError(parsed.error);
  }
  const { scheduleId, scheduledOn, transactionId, debtPaymentId } = parsed.data;
  if (Boolean(transactionId) === Boolean(debtPaymentId)) {
    throw new DomainError("INVALID_INPUT", [
      {
        field: "actual",
        message: "Chọn đúng một giao dịch hoặc khoản thanh toán nợ.",
      },
    ]);
  }

  const db = getDb();
  try {
    await db.transaction(async (tx) => {
      const [schedule] = await tx
        .select()
        .from(cashFlowSchedule)
        .where(
          and(
            eq(cashFlowSchedule.id, scheduleId),
            eq(cashFlowSchedule.userId, userId),
          ),
        )
        .for("update")
        .limit(1);
      if (!schedule) throw new DomainError("NOT_FOUND");

      const occurrence = getScheduleOccurrences(
        [schedule],
        scheduledOn,
        new Date(
          new Date(`${scheduledOn}T00:00:00.000Z`).getTime() + 86_400_000,
        )
          .toISOString()
          .slice(0, 10),
      )[0];
      if (!occurrence) {
        throw new DomainError("INVALID_INPUT", [
          {
            field: "scheduledOn",
            message: "Ngày này không thuộc lịch dự kiến.",
          },
        ]);
      }

      let actualId: string;
      if (transactionId) {
        const [actual] = await tx
          .select()
          .from(transaction)
          .where(
            and(
              eq(transaction.id, transactionId),
              eq(transaction.userId, userId),
              eq(transaction.occurredOn, scheduledOn),
              eq(transaction.kind, schedule.kind),
            ),
          )
          .for("update")
          .limit(1);
        if (!actual) throw new DomainError("NOT_FOUND");
        const [isDebtPayment] = await tx
          .select({ id: debtPayment.id })
          .from(debtPayment)
          .where(eq(debtPayment.transactionId, transactionId))
          .limit(1);
        if (isDebtPayment) {
          throw new DomainError("INVALID_INPUT", [
            {
              field: "transactionId",
              message: "Hãy chọn khoản thanh toán nợ trực tiếp.",
            },
          ]);
        }
        actualId = transactionId;
      } else {
        const [actual] = await tx
          .select()
          .from(debtPayment)
          .where(
            and(
              eq(debtPayment.id, debtPaymentId!),
              eq(debtPayment.userId, userId),
              eq(debtPayment.paidOn, scheduledOn),
            ),
          )
          .for("update")
          .limit(1);
        if (!actual) throw new DomainError("NOT_FOUND");
        if (schedule.kind !== "expense") {
          throw new DomainError("INVALID_INPUT", [
            {
              field: "debtPaymentId",
              message: "Khoản thanh toán nợ chỉ khớp với lịch chi.",
            },
          ]);
        }
        actualId = debtPaymentId!;
      }

      const [alreadyUsed] = await tx
        .select({ id: cashFlowOccurrenceMatch.id })
        .from(cashFlowOccurrenceMatch)
        .where(
          and(
            transactionId
              ? eq(cashFlowOccurrenceMatch.transactionId, actualId)
              : eq(cashFlowOccurrenceMatch.debtPaymentId, actualId),
          ),
        )
        .limit(1);
      const [current] = await tx
        .select({ id: cashFlowOccurrenceMatch.id })
        .from(cashFlowOccurrenceMatch)
        .where(
          and(
            eq(cashFlowOccurrenceMatch.scheduleId, scheduleId),
            eq(cashFlowOccurrenceMatch.scheduledOn, scheduledOn),
          ),
        )
        .limit(1);
      if (alreadyUsed && alreadyUsed.id !== current?.id) {
        throw new DomainError("CONFLICT", [
          { field: "actual", message: "Giao dịch này đã được khớp trước đó." },
        ]);
      }

      await tx
        .insert(cashFlowOccurrenceMatch)
        .values({
          userId,
          scheduleId,
          scheduledOn,
          transactionId: transactionId ?? null,
          debtPaymentId: debtPaymentId ?? null,
        })
        .onConflictDoUpdate({
          target: [
            cashFlowOccurrenceMatch.scheduleId,
            cashFlowOccurrenceMatch.scheduledOn,
          ],
          set: {
            transactionId: transactionId ?? null,
            debtPaymentId: debtPaymentId ?? null,
          },
        });
    });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    if (isUniqueViolation(error)) {
      throw new DomainError("CONFLICT", [
        { field: "actual", message: "Giao dịch này đã được khớp trước đó." },
      ]);
    }
    throw error;
  }
}

export async function removeOccurrenceMatch(
  userId: string,
  input: unknown,
): Promise<void> {
  const parsed = matchInputSchema
    .pick({ scheduleId: true, scheduledOn: true })
    .safeParse(input);
  if (!parsed.success) throw toDomainError(parsed.error);
  await getDb()
    .delete(cashFlowOccurrenceMatch)
    .where(
      and(
        eq(cashFlowOccurrenceMatch.userId, userId),
        eq(cashFlowOccurrenceMatch.scheduleId, parsed.data.scheduleId),
        eq(cashFlowOccurrenceMatch.scheduledOn, parsed.data.scheduledOn),
      ),
    );
}
