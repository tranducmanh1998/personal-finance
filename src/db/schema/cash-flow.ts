import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { financeKind } from "./categories";
import { debtPayment } from "./debt-payments";
import { transaction } from "./finance";

export type ScheduleRecurrence = "once" | "weekly" | "monthly";

export const cashFlowSchedule = pgTable(
  "cash_flow_schedule",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: financeKind("kind").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    endDate: date("end_date"),
    description: text("description"),
    recurrence: text("recurrence")
      .$type<ScheduleRecurrence>()
      .notNull()
      .default("once"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("cash_flow_schedule_user_date_idx").on(
      table.userId,
      table.scheduledOn,
    ),
    uniqueIndex("cash_flow_schedule_id_user_id_unique").on(
      table.id,
      table.userId,
    ),
    check("cash_flow_schedule_amount_positive_check", sql`${table.amount} > 0`),
    check(
      "cash_flow_schedule_recurrence_check",
      sql`${table.recurrence} in ('once', 'weekly', 'monthly')`,
    ),
  ],
);

export const cashFlowOccurrenceMatch = pgTable(
  "cash_flow_occurrence_match",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    scheduleId: uuid("schedule_id").notNull(),
    scheduledOn: date("scheduled_on").notNull(),
    transactionId: uuid("transaction_id"),
    debtPaymentId: uuid("debt_payment_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "cash_flow_match_schedule_owner_fk",
      columns: [table.scheduleId, table.userId],
      foreignColumns: [cashFlowSchedule.id, cashFlowSchedule.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "cash_flow_match_transaction_owner_fk",
      columns: [table.transactionId, table.userId],
      foreignColumns: [transaction.id, transaction.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "cash_flow_match_debt_payment_owner_fk",
      columns: [table.debtPaymentId, table.userId],
      foreignColumns: [debtPayment.id, debtPayment.userId],
    }).onDelete("restrict"),
    uniqueIndex("cash_flow_match_schedule_date_unique").on(
      table.scheduleId,
      table.scheduledOn,
    ),
    uniqueIndex("cash_flow_match_transaction_unique").on(table.transactionId),
    uniqueIndex("cash_flow_match_debt_payment_unique").on(table.debtPaymentId),
    index("cash_flow_match_user_date_idx").on(table.userId, table.scheduledOn),
    check(
      "cash_flow_match_actual_check",
      sql`(${table.transactionId} IS NOT NULL AND ${table.debtPaymentId} IS NULL) OR (${table.transactionId} IS NULL AND ${table.debtPaymentId} IS NOT NULL)`,
    ),
  ],
);
