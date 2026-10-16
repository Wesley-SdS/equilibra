ALTER TABLE "actions" ADD COLUMN "decision" jsonb;--> statement-breakpoint
ALTER TABLE "channel_reports" ADD COLUMN "triage" jsonb;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD COLUMN "dimension" text;--> statement-breakpoint
ALTER TABLE "custom_questions" ADD COLUMN "dimension_confidence" integer;