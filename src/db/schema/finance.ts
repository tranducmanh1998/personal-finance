import {
  bigint,
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
import { category, financeKind } from "./categories";

export const transaction = pgTable(
  "transaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    categoryId: uuid("category_id").notNull(),
    kind: financeKind("kind").notNull(),
    amount: bigint("amount", { mode: "bigint" }).notNull(),
    occurredOn: date("occurred_on").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    foreignKey({
      name: "transaction_category_owner_kind_fk",
      columns: [table.categoryId, table.userId, table.kind],
      foreignColumns: [category.id, category.userId, category.kind],
    }).onDelete("restrict"),
    index("transaction_user_date_idx").on(table.userId, table.occurredOn),
    index("transaction_user_category_idx").on(table.userId, table.categoryId),
    uniqueIndex("transaction_id_user_id_unique").on(table.id, table.userId),
  ],
);
