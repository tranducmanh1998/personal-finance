CREATE TYPE "public"."history_close_kind" AS ENUM('backfill', 'automatic');--> statement-breakpoint
CREATE TYPE "public"."history_debt_balance_status" AS ENUM('complete', 'insufficient_history');--> statement-breakpoint
CREATE TABLE "history_asset_snapshot" (
	"snapshot_id" uuid NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"as_of_date" date NOT NULL,
	CONSTRAINT "history_asset_snapshot_pk" PRIMARY KEY("snapshot_id","kind")
);
--> statement-breakpoint
CREATE TABLE "history_backfill_state" (
	"user_id" text PRIMARY KEY NOT NULL,
	"start_month" text NOT NULL,
	"end_month" text NOT NULL,
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "history_backfill_start_month_format_check" CHECK ("history_backfill_state"."start_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "history_backfill_end_month_format_check" CHECK ("history_backfill_state"."end_month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "history_backfill_month_range_check" CHECK ("history_backfill_state"."start_month" <= "history_backfill_state"."end_month")
);
--> statement-breakpoint
CREATE TABLE "history_debt_payment_snapshot" (
	"snapshot_id" uuid NOT NULL,
	"source_payment_id" uuid NOT NULL,
	"source_debt_id" uuid NOT NULL,
	"period" text NOT NULL,
	"paid_on" date NOT NULL,
	"principal_amount" bigint NOT NULL,
	"interest_amount" bigint NOT NULL,
	"borrower_name" text NOT NULL,
	"loan_type" text NOT NULL,
	CONSTRAINT "history_debt_payment_snapshot_pk" PRIMARY KEY("snapshot_id","source_payment_id")
);
--> statement-breakpoint
CREATE TABLE "history_debt_snapshot" (
	"snapshot_id" uuid NOT NULL,
	"source_debt_id" uuid NOT NULL,
	"borrower_name" text NOT NULL,
	"loan_type" text NOT NULL,
	"balance_as_of" date NOT NULL,
	"closing_balance" bigint,
	"balance_status" "history_debt_balance_status" NOT NULL,
	CONSTRAINT "history_debt_snapshot_pk" PRIMARY KEY("snapshot_id","source_debt_id"),
	CONSTRAINT "history_debt_snapshot_balance_status_check" CHECK (("history_debt_snapshot"."balance_status" = 'complete' AND "history_debt_snapshot"."closing_balance" IS NOT NULL) OR ("history_debt_snapshot"."balance_status" = 'insufficient_history' AND "history_debt_snapshot"."closing_balance" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "history_transaction_snapshot" (
	"snapshot_id" uuid NOT NULL,
	"source_transaction_id" uuid NOT NULL,
	"occurred_on" date NOT NULL,
	"kind" "finance_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"category_id" uuid NOT NULL,
	"category_name" text NOT NULL,
	"description" text,
	"is_debt_payment" boolean DEFAULT false NOT NULL,
	CONSTRAINT "history_transaction_snapshot_pk" PRIMARY KEY("snapshot_id","source_transaction_id")
);
--> statement-breakpoint
CREATE TABLE "monthly_history_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"month" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end_exclusive" date NOT NULL,
	"closed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"close_kind" "history_close_kind" NOT NULL,
	"income_total" numeric(1000, 0) NOT NULL,
	"expense_total" numeric(1000, 0) NOT NULL,
	"known_debt_total" numeric(1000, 0) NOT NULL,
	"unresolved_debt_count" integer NOT NULL,
	CONSTRAINT "monthly_history_snapshot_month_format_check" CHECK ("monthly_history_snapshot"."month" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "monthly_history_snapshot_period_check" CHECK ("monthly_history_snapshot"."period_end_exclusive" > "monthly_history_snapshot"."period_start"),
	CONSTRAINT "monthly_history_snapshot_unresolved_debts_nonnegative_check" CHECK ("monthly_history_snapshot"."unresolved_debt_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "history_asset_snapshot" ADD CONSTRAINT "history_asset_snapshot_parent_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monthly_history_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_backfill_state" ADD CONSTRAINT "history_backfill_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_debt_payment_snapshot" ADD CONSTRAINT "history_debt_payment_snapshot_parent_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monthly_history_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_debt_snapshot" ADD CONSTRAINT "history_debt_snapshot_parent_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monthly_history_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "history_transaction_snapshot" ADD CONSTRAINT "history_transaction_snapshot_parent_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."monthly_history_snapshot"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_history_snapshot" ADD CONSTRAINT "monthly_history_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "history_debt_payment_snapshot_date_idx" ON "history_debt_payment_snapshot" USING btree ("snapshot_id","paid_on");--> statement-breakpoint
CREATE INDEX "history_transaction_snapshot_date_idx" ON "history_transaction_snapshot" USING btree ("snapshot_id","occurred_on");--> statement-breakpoint
CREATE UNIQUE INDEX "monthly_history_snapshot_user_month_unique" ON "monthly_history_snapshot" USING btree ("user_id","month");--> statement-breakpoint
CREATE INDEX "monthly_history_snapshot_user_month_idx" ON "monthly_history_snapshot" USING btree ("user_id","month");