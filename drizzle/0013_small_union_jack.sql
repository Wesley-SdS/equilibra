ALTER TABLE "actions" ADD COLUMN "steps" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "evidence" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
UPDATE "actions" SET "completed_at" = COALESCE(NULLIF("due", '')::timestamp, "created_at") WHERE "status" = 'done';
