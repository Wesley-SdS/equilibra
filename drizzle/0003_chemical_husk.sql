ALTER TABLE "companies" ADD COLUMN "plan" text DEFAULT 'profissional' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "subscription_status" text DEFAULT 'trialing' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "billing_interval" text DEFAULT 'monthly' NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "trial_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "current_period_end" timestamp;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "billing_provider" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "provider_customer_id" text;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "provider_subscription_id" text;--> statement-breakpoint
-- Empresas que já existiam ganham 14 dias de teste a partir desta versão.
UPDATE "companies" SET "trial_ends_at" = now() + interval '14 days' WHERE "trial_ends_at" IS NULL;
