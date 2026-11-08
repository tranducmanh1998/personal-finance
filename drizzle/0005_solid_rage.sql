CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"target_amount" bigint NOT NULL,
	"target_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_target_amount_nonnegative_check" CHECK ("goal"."target_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "goal_transaction" (
	"goal_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_transaction_pk" PRIMARY KEY("goal_id","transaction_id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "goal_id_user_id_unique" ON "goal" USING btree ("id","user_id");--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_transaction" ADD CONSTRAINT "goal_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_transaction" ADD CONSTRAINT "goal_transaction_goal_owner_fk" FOREIGN KEY ("goal_id","user_id") REFERENCES "public"."goal"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal_transaction" ADD CONSTRAINT "goal_transaction_transaction_owner_fk" FOREIGN KEY ("transaction_id","user_id") REFERENCES "public"."transaction"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "goal_user_idx" ON "goal" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_transaction_user_idx" ON "goal_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "goal_transaction_transaction_idx" ON "goal_transaction" USING btree ("transaction_id");