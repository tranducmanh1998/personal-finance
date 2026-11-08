CREATE TABLE "cash_flow_schedule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" "finance_kind" NOT NULL,
	"amount" bigint NOT NULL,
	"scheduled_on" date NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "cash_flow_schedule_amount_positive_check" CHECK ("cash_flow_schedule"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "cash_flow_schedule" ADD CONSTRAINT "cash_flow_schedule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "cash_flow_schedule_user_date_idx" ON "cash_flow_schedule" USING btree ("user_id","scheduled_on");