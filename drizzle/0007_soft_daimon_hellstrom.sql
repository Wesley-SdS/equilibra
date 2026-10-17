ALTER TABLE "actions" ADD COLUMN "notified_stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "notified_at" timestamp;