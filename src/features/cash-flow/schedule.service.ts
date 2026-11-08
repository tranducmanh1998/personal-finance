import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  cashFlowOccurrenceMatch,
  cashFlowSchedule,
  type ScheduleRecurrence,
} from "@/db/schema/cash-flow";
import { DomainError } from "@/lib/errors";
import { validateInput } from "@/lib/validation";
import { z } from "zod";

const maximumPostgresBigint = 9_223_372_036_854_775_807n;

const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày phải theo định dạng YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      Number.isFinite(date.getTime()) &&
      date.getUTCFullYear() > 0 &&
      date.toISOString().slice(0, 10) === value
    );
  }, "Ngày không hợp lệ.");

const amountSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "Số tiền phải là số nguyên dương.")
  .transform((value) => BigInt(value))
  .refine((value) => value <= maximumPostgresBigint, {
    message: "Số tiền vượt quá giới hạn lưu trữ.",
  });

const scheduleInputSchema = z
  .object({
    kind: z.enum(["income", "expense"]),
    amount: amountSchema,
    scheduledOn: dateSchema,
    recurrence: z.enum(["once", "weekly", "monthly"]).default("once"),
    endDate: z
      .union([dateSchema, z.literal("")])
      .nullable()
      .optional()
      .transform((value) => value || null),
    description: z
      .string()
      .trim()
      .max(500, "Mô tả không được vượt quá 500 ký tự.")
      .optional()
      .transform((value) => value || null),
  })
  .superRefine((value, context) => {
    if (value.endDate && value.endDate < value.scheduledOn) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Ngày kết thúc phải từ ngày bắt đầu trở đi.",
      });
    }
    if (value.recurrence === "once" && value.endDate) {
      context.addIssue({
        code: "custom",
        path: ["endDate"],
        message: "Khoản một lần không dùng ngày kết thúc lặp.",
      });
    }
  });

export type ScheduleItemDto = Readonly<{
  id: string;
  kind: "income" | "expense";
  amount: string;
  scheduledOn: string;
  endDate: string | null;
  recurrence: ScheduleRecurrence;
  description: string | null;
}>;

function parseScheduleInput(input: unknown) {
  return validateInput(scheduleInputSchema, input);
}

function parseScheduleItemId(input: unknown): string {
  return validateInput(z.uuid(), input);
}

function serializeScheduleItem(
  item: typeof cashFlowSchedule.$inferSelect,
): ScheduleItemDto {
  return {
    id: item.id,
    kind: item.kind,
    amount: item.amount.toString(),
    scheduledOn: item.scheduledOn,
    endDate: item.endDate,
    recurrence: item.recurrence,
    description: item.description,
  };
}

export async function listScheduleItems(
  userId: string,
): Promise<readonly ScheduleItemDto[]> {
  const records = await getDb()
    .select()
    .from(cashFlowSchedule)
    .where(eq(cashFlowSchedule.userId, userId))
    .orderBy(
      asc(cashFlowSchedule.scheduledOn),
      asc(cashFlowSchedule.createdAt),
    );
  return records.map(serializeScheduleItem);
}

export async function createScheduleItem(
  userId: string,
  input: unknown,
): Promise<ScheduleItemDto> {
  const values = parseScheduleInput(input);
  const [created] = await getDb()
    .insert(cashFlowSchedule)
    .values({ userId, ...values })
    .returning();
  if (!created) {
    throw new Error("Could not create the cash-flow schedule item.");
  }
  return serializeScheduleItem(created);
}

export async function updateScheduleItem(
  userId: string,
  itemId: unknown,
  input: unknown,
): Promise<ScheduleItemDto | null> {
  const id = parseScheduleItemId(itemId);
  const values = parseScheduleInput(input);
  return getDb().transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(cashFlowSchedule)
      .where(
        and(eq(cashFlowSchedule.id, id), eq(cashFlowSchedule.userId, userId)),
      )
      .for("update")
      .limit(1);
    if (!existing) return null;

    const definitionChanged =
      existing.kind !== values.kind ||
      existing.scheduledOn !== values.scheduledOn ||
      existing.recurrence !== values.recurrence ||
      existing.endDate !== values.endDate;
    if (definitionChanged) {
      const [match] = await tx
        .select({ id: cashFlowOccurrenceMatch.id })
        .from(cashFlowOccurrenceMatch)
        .where(
          and(
            eq(cashFlowOccurrenceMatch.scheduleId, id),
            eq(cashFlowOccurrenceMatch.userId, userId),
          ),
        )
        .limit(1);
      if (match) {
        throw new DomainError("CONFLICT", [
          {
            field: "recurrence",
            message:
              "Hãy gỡ các giao dịch đã khớp trước khi đổi loại hoặc lịch lặp.",
          },
        ]);
      }
    }

    const [updated] = await tx
      .update(cashFlowSchedule)
      .set({ ...values, updatedAt: new Date() })
      .where(
        and(eq(cashFlowSchedule.id, id), eq(cashFlowSchedule.userId, userId)),
      )
      .returning();
    return updated ? serializeScheduleItem(updated) : null;
  });
}

export async function deleteScheduleItem(
  userId: string,
  itemId: unknown,
): Promise<boolean> {
  const id = parseScheduleItemId(itemId);
  const [deleted] = await getDb()
    .delete(cashFlowSchedule)
    .where(
      and(eq(cashFlowSchedule.id, id), eq(cashFlowSchedule.userId, userId)),
    )
    .returning({ id: cashFlowSchedule.id });
  return deleted !== undefined;
}

export function scheduleItemNotFound(): DomainError {
  return new DomainError("NOT_FOUND", [
    {
      field: "itemId",
      message: "Không tìm thấy khoản dự kiến thuộc tài khoản của bạn.",
    },
  ]);
}
