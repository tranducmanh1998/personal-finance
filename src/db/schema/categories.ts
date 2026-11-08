import { user } from "./auth";
import {
  boolean,
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const financeKind = pgEnum("finance_kind", ["income", "expense"]);

export const category = pgTable(
  "category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    kind: financeKind("kind").notNull(),
    isMonthlySavings: boolean("is_monthly_savings").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("category_user_kind_name_unique").on(
      table.userId,
      table.kind,
      table.name,
    ),
    uniqueIndex("category_id_user_kind_unique").on(
      table.id,
      table.userId,
      table.kind,
    ),
    uniqueIndex("category_one_monthly_savings_per_user_unique")
      .on(table.userId)
      .where(sql`${table.isMonthlySavings} = true`),
    index("category_user_kind_idx").on(table.userId, table.kind),
    check(
      "category_monthly_savings_expense_check",
      sql`${table.isMonthlySavings} = false OR ${table.kind} = 'expense'`,
    ),
  ],
);
