CREATE TABLE "debt_payment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"debt_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"period" text NOT NULL,
	"paid_on" date NOT NULL,
	"principal_amount" bigint NOT NULL,
	"interest_amount" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "debt_payment_period_format_check" CHECK ("debt_payment"."period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
	CONSTRAINT "debt_payment_amounts_nonnegative_check" CHECK ("debt_payment"."principal_amount" >= 0 AND "debt_payment"."interest_amount" >= 0),
	CONSTRAINT "debt_payment_amounts_total_check" CHECK ("debt_payment"."principal_amount"::numeric + "debt_payment"."interest_amount"::numeric <= 9223372036854775807 AND "debt_payment"."principal_amount"::numeric + "debt_payment"."interest_amount"::numeric > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "debt_id_user_id_unique" ON "debt" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_id_user_id_unique" ON "transaction" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "debt_payment" ADD CONSTRAINT "debt_payment_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payment" ADD CONSTRAINT "debt_payment_debt_owner_fk" FOREIGN KEY ("debt_id","user_id") REFERENCES "public"."debt"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "debt_payment" ADD CONSTRAINT "debt_payment_transaction_owner_fk" FOREIGN KEY ("transaction_id","user_id") REFERENCES "public"."transaction"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payment_debt_period_unique" ON "debt_payment" USING btree ("debt_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payment_transaction_unique" ON "debt_payment" USING btree ("transaction_id");--> statement-breakpoint
CREATE INDEX "debt_payment_user_date_idx" ON "debt_payment" USING btree ("user_id","paid_on");