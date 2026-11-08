import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { assetKind } from "./assets";
import { financeKind } from "./categories";
import { user } from "./auth";

export const historyCloseKind = pgEnum("history_close_kind", [
  "backfill",
  "automatic",
]);
export const historyDebtBalanceStatus = pgEnum("history_debt_balance_status", [
  "complete",
  "insufficient_history",
]);

export const monthlyHistorySnapshot = pgTable(
  "monthly_history_snapshot",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    month: text("month").notNull(),
    periodStart: date("period_start").notNull(),
    periodEndExclusive: date("period_end_exclusive").notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    closeKind: historyCloseKind("close_kind").notNull(),
    incomeTotal: numeric("income_total", {
      precision: 1000,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    expenseTotal: numeric("expense_total", {
      precision: 1000,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    knownDebtTotal: numeric("known_debt_total", {
      precision: 1000,
      scale: 0,
      mode: "bigint",
    }).notNull(),
    unresolvedDebtCount: integer("unresolved_debt_count").notNull(),
  },
  (table) => [
    uniqueIndex("monthly_history_snapshot_user_month_unique").on(
      table.userId,
      table.month,
    ),
    index("monthly_history_snapshot_user_month_idx").on(
      table.userId,
      table.month,
    ),
    check(
      "monthly_history_snapshot_month_format_check",
      sql`${table.month} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "monthly_history_snapshot_period_check",
      sql`${table.periodEndExclusive} > ${table.periodStart}`,
    ),
    check(
      "monthly_history_snapshot_unresolved_debts_nonnegative_check",
      sql`${table.unresolvedDebtCount} >= 0`,
    ),
  ],
);

export const historyTransactionSnapshot = pgTable(
  "history_transaction_snapshot",
  {
    snapshotId: uuid("snapshot_id").notNull(),
    sourceTransactionId: uuid("source_transaction_id").notNull(),
    occurredOn: date("occurred_on").notNull(),
    kind: financeKind("kind").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    categoryId: uuid("category_id").notNull(),
    categoryName: text("category_name").notNull(),
    description: text("description"),
    isDebtPayment: boolean("is_debt_payment").notNull().default(false),
  },
  (table) => [
    primaryKey({
      name: "history_transaction_snapshot_pk",
      columns: [table.snapshotId, table.sourceTransactionId],
    }),
    foreignKey({
      name: "history_transaction_snapshot_parent_fk",
      columns: [table.snapshotId],
      foreignColumns: [monthlyHistorySnapshot.id],
    }).onDelete("cascade"),
    index("history_transaction_snapshot_date_idx").on(
      table.snapshotId,
      table.occurredOn,
    ),
  ],
);

export const historyAssetSnapshot = pgTable(
  "history_asset_snapshot",
  {
    snapshotId: uuid("snapshot_id").notNull(),
    kind: assetKind("kind").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    asOfDate: date("as_of_date").notNull(),
  },
  (table) => [
    primaryKey({
      name: "history_asset_snapshot_pk",
      columns: [table.snapshotId, table.kind],
    }),
    foreignKey({
      name: "history_asset_snapshot_parent_fk",
      columns: [table.snapshotId],
      foreignColumns: [monthlyHistorySnapshot.id],
    }).onDelete("cascade"),
  ],
);

export const historyDebtSnapshot = pgTable(
  "history_debt_snapshot",
  {
    snapshotId: uuid("snapshot_id").notNull(),
    sourceDebtId: uuid("source_debt_id").notNull(),
    borrowerName: text("borrower_name").notNull(),
    loanType: text("loan_type").notNull(),
    balanceAsOf: date("balance_as_of").notNull(),
    closingBalance: bigint("closing_balance", { mode: "bigint" }),
    balanceStatus: historyDebtBalanceStatus("balance_status").notNull(),
  },
  (table) => [
    primaryKey({
      name: "history_debt_snapshot_pk",
      columns: [table.snapshotId, table.sourceDebtId],
    }),
    foreignKey({
      name: "history_debt_snapshot_parent_fk",
      columns: [table.snapshotId],
      foreignColumns: [monthlyHistorySnapshot.id],
    }).onDelete("cascade"),
    check(
      "history_debt_snapshot_balance_status_check",
      sql`(${table.balanceStatus} = 'complete' AND ${table.closingBalance} IS NOT NULL) OR (${table.balanceStatus} = 'insufficient_history' AND ${table.closingBalance} IS NULL)`,
    ),
  ],
);

export const historyDebtPaymentSnapshot = pgTable(
  "history_debt_payment_snapshot",
  {
    snapshotId: uuid("snapshot_id").notNull(),
    sourcePaymentId: uuid("source_payment_id").notNull(),
    sourceDebtId: uuid("source_debt_id").notNull(),
    period: text("period").notNull(),
    paidOn: date("paid_on").notNull(),
    principalAmount: bigint("principal_amount", { mode: "bigint" }).notNull(),
    interestAmount: bigint("interest_amount", { mode: "bigint" }).notNull(),
    borrowerName: text("borrower_name").notNull(),
    loanType: text("loan_type").notNull(),
  },
  (table) => [
    primaryKey({
      name: "history_debt_payment_snapshot_pk",
      columns: [table.snapshotId, table.sourcePaymentId],
    }),
    foreignKey({
      name: "history_debt_payment_snapshot_parent_fk",
      columns: [table.snapshotId],
      foreignColumns: [monthlyHistorySnapshot.id],
    }).onDelete("cascade"),
    index("history_debt_payment_snapshot_date_idx").on(
      table.snapshotId,
      table.paidOn,
    ),
  ],
);

export const historyBackfillState = pgTable(
  "history_backfill_state",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    startMonth: text("start_month").notNull(),
    endMonth: text("end_month").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "history_backfill_start_month_format_check",
      sql`${table.startMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "history_backfill_end_month_format_check",
      sql`${table.endMonth} ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'`,
    ),
    check(
      "history_backfill_month_range_check",
      sql`${table.startMonth} <= ${table.endMonth}`,
    ),
  ],
);
