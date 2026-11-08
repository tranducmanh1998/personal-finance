CREATE TABLE "cash_flow_occurrence_match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"schedule_id" uuid NOT NULL,
	"scheduled_on" date NOT NULL,
	"transaction_id" uuid,
	"debt_payment_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flow_match_actual_check" CHECK (("cash_flow_occurrence_match"."transaction_id" IS NOT NULL AND "cash_flow_occurrence_match"."debt_payment_id" IS NULL) OR ("cash_flow_occurrence_match"."transaction_id" IS NULL AND "cash_flow_occurrence_match"."debt_payment_id" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "cash_flow_schedule" ADD COLUMN "end_date" date;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_schedule_id_user_id_unique" ON "cash_flow_schedule" USING btree ("id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "debt_payment_id_user_id_unique" ON "debt_payment" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "cash_flow_occurrence_match" ADD CONSTRAINT "cash_flow_occurrence_match_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_occurrence_match" ADD CONSTRAINT "cash_flow_match_schedule_owner_fk" FOREIGN KEY ("schedule_id","user_id") REFERENCES "public"."cash_flow_schedule"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_occurrence_match" ADD CONSTRAINT "cash_flow_match_transaction_owner_fk" FOREIGN KEY ("transaction_id","user_id") REFERENCES "public"."transaction"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cash_flow_occurrence_match" ADD CONSTRAINT "cash_flow_match_debt_payment_owner_fk" FOREIGN KEY ("debt_payment_id","user_id") REFERENCES "public"."debt_payment"("id","user_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_match_schedule_date_unique" ON "cash_flow_occurrence_match" USING btree ("schedule_id","scheduled_on");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_match_transaction_unique" ON "cash_flow_occurrence_match" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cash_flow_match_debt_payment_unique" ON "cash_flow_occurrence_match" USING btree ("debt_payment_id");--> statement-breakpoint
CREATE INDEX "cash_flow_match_user_date_idx" ON "cash_flow_occurrence_match" USING btree ("user_id","scheduled_on");