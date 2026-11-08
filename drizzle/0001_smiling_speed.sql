CREATE TYPE "public"."asset_kind" AS ENUM('cash', 'savings_deposit', 'cash_equivalent');--> statement-breakpoint
CREATE TYPE "public"."finance_kind" AS ENUM('income', 'expense');--> statement-breakpoint
CREATE TABLE "asset_balance" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "asset_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"as_of_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "asset_balance_nonnegative_check" CHECK ("asset_balance"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" "finance_kind" NOT NULL,
	"is_monthly_savings" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_monthly_savings_expense_check" CHECK ("category"."is_monthly_savings" = false OR "category"."kind" = 'expense')
);
--> statement-breakpoint
CREATE TABLE "debt" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"balance_as_of" date NOT NULL,
	"balance_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_balance_nonnegative_check" CHECK ("debt"."balance_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid NOT NULL,
	"kind" "finance_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"occurred_on" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "asset_balance" ADD CONSTRAINT "asset_balance_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "asset_balance_user_kind_date_unique" ON "asset_balance" USING btree ("user_id","kind","as_of_date");--> statement-breakpoint
CREATE INDEX "asset_balance_user_date_idx" ON "asset_balance" USING btree ("user_id","as_of_date");--> statement-breakpoint
CREATE UNIQUE INDEX "category_user_kind_name_unique" ON "category" USING btree ("user_id","kind","name");--> statement-breakpoint
CREATE UNIQUE INDEX "category_id_user_kind_unique" ON "category" USING btree ("id","user_id","kind");--> statement-breakpoint
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_category_owner_kind_fk" FOREIGN KEY ("category_id","user_id","kind") REFERENCES "public"."category"("id","user_id","kind") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_one_monthly_savings_per_user_unique" ON "category" USING btree ("user_id") WHERE "category"."is_monthly_savings" = true;--> statement-breakpoint
CREATE INDEX "category_user_kind_idx" ON "category" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "debt_user_idx" ON "debt" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transaction_user_date_idx" ON "transaction" USING btree ("user_id","occurred_on");--> statement-breakpoint
CREATE INDEX "transaction_user_category_idx" ON "transaction" USING btree ("user_id","category_id");