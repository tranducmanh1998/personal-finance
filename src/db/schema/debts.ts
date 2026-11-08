import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const debt = pgTable(
  "debt",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    borrowerName: text("borrower_name").notNull(),
    loanType: text("loan_type").notNull(),
    balanceAsOf: date("balance_as_of").notNull(),
    balanceAmount: bigint("balance_amount", { mode: "bigint" }).notNull(),
    dueDate: date("due_date"),
    principalDuePerPeriod: bigint("principal_due_per_period", {
      mode: "bigint",
    }).notNull(),
    interestDuePerPeriod: bigint("interest_due_per_period", {
      mode: "bigint",
    }).notNull(),
    paymentDuePerPeriod: bigint("payment_due_per_period", {
      mode: "bigint",
    }).notNull(),
    finalPeriod: date("final_period"),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("debt_user_idx").on(table.userId),
    uniqueIndex("debt_id_user_id_unique").on(table.id, table.userId),
    check("debt_balance_nonnegative_check", sql`${table.balanceAmount} >= 0`),
    check(
      "debt_principal_due_nonnegative_check",
      sql`${table.principalDuePerPeriod} >= 0`,
    ),
    check(
      "debt_interest_due_nonnegative_check",
      sql`${table.interestDuePerPeriod} >= 0`,
    ),
    check(
      "debt_payment_due_nonnegative_check",
      sql`${table.paymentDuePerPeriod} >= 0`,
    ),
    check(
      "debt_archived_settled_check",
      sql`${table.archivedAt} IS NULL OR ${table.balanceAmount} = 0`,
    ),
  ],
);
