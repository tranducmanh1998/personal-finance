import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { transaction } from "./finance";
import { user } from "./auth";

export const goal = pgTable(
  "goal",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    targetAmount: bigint("target_amount", { mode: "bigint" }).notNull(),
    targetDate: date("target_date"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("goal_id_user_id_unique").on(table.id, table.userId),
    index("goal_user_idx").on(table.userId),
    check(
      "goal_target_amount_nonnegative_check",
      sql`${table.targetAmount} >= 0`,
    ),
  ],
);

export const goalTransaction = pgTable(
  "goal_transaction",
  {
    goalId: uuid("goal_id").notNull(),
    transactionId: uuid("transaction_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({
      name: "goal_transaction_pk",
      columns: [table.goalId, table.transactionId],
    }),
    foreignKey({
      name: "goal_transaction_goal_owner_fk",
      columns: [table.goalId, table.userId],
      foreignColumns: [goal.id, goal.userId],
    }).onDelete("cascade"),
    foreignKey({
      name: "goal_transaction_transaction_owner_fk",
      columns: [table.transactionId, table.userId],
      foreignColumns: [transaction.id, transaction.userId],
    }).onDelete("cascade"),
    index("goal_transaction_user_idx").on(table.userId),
    index("goal_transaction_transaction_idx").on(table.transactionId),
  ],
);
