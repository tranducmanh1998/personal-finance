ALTER TABLE "debt" RENAME COLUMN "name" TO "borrower_name";--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "loan_type" text DEFAULT 'unclassified' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "loan_type" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "principal_due_per_period" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "principal_due_per_period" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "interest_due_per_period" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "interest_due_per_period" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "payment_due_per_period" bigint DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "debt" ALTER COLUMN "payment_due_per_period" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "debt" ADD COLUMN "final_period" date;--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_principal_due_nonnegative_check" CHECK ("debt"."principal_due_per_period" >= 0);--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_interest_due_nonnegative_check" CHECK ("debt"."interest_due_per_period" >= 0);--> statement-breakpoint
ALTER TABLE "debt" ADD CONSTRAINT "debt_payment_due_nonnegative_check" CHECK ("debt"."payment_due_per_period" >= 0);