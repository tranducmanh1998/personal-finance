import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  date,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

export const assetKind = pgEnum("asset_kind", [
  "cash",
  "savings_deposit",
  "cash_equivalent",
]);

export const assetBalance = pgTable(
  "asset_balance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: assetKind("kind").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    asOfDate: date("as_of_date").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("asset_balance_user_kind_date_unique").on(
      table.userId,
      table.kind,
      table.asOfDate,
    ),
    index("asset_balance_user_date_idx").on(table.userId, table.asOfDate),
    check(
      "asset_balance_nonnegative_check",
      sql`${table.amount} >= 0`,
    ),
  ],
);
