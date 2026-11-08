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
import { debt } from "./debts";
import { transaction } from "./finance";

export const debtPayment = pgTable(
  "debt_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    debtId: uuid("debt_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    period: text("period").notNull(),
    paidOn: date("paid_on").notNull(),
    principalAmount: bigint("principal_amount", { mode: "bigint" }).notNull(),
    interestAmount: bigint("interest_amount", { mode: "bigint" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "debt_payment_debt_owner_fk",
      columns: [table.debtId, table.userId],
      foreignColumns: [debt.id, debt.userId],
    }).onDelete("restrict"),
    foreignKey({
      name: "debt_payment_transaction_owner_fk",
      columns: [table.transactionId, table.userId],
      foreignColumns: [transaction.id, transaction.userId],
    }).onDelete("restrict"),
    uniqueIndex("debt_payment_debt_period_unique").on(
      table.debtId,
      table.period,
    ),
    uniqueIndex("debt_payment_transaction_unique").on(table.transactionId),
    uniqueIndex("debt_payment_id_user_id_unique").on(table.id, table.userId),
    index("debt_payment_user_date_idx").on(table.userId, table.paidOn),
    check(
      "debt_payment_period_format_check",
      sql`${table.period} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "debt_payment_amounts_nonnegative_check",
      sql`${table.principalAmount} >= 0 AND ${table.interestAmount} >= 0`,
    ),
    check(
      "debt_payment_amounts_total_check",
      sql`${table.principalAmount}::numeric + ${table.interestAmount}::numeric <= 9223372036854775807 AND ${table.principalAmount}::numeric + ${table.interestAmount}::numeric > 0`,
    ),
  ],
);
