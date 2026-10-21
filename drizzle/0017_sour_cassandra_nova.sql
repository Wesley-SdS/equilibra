ALTER TABLE "imports" ADD COLUMN "template" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "questionnaires" ADD COLUMN "instrument" text;