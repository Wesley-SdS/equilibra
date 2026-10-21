CREATE TABLE "observations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"day" text NOT NULL,
	"method" text NOT NULL,
	"sector_id" text,
	"participants" integer DEFAULT 0 NOT NULL,
	"summary" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"text" text NOT NULL,
	"engine" text NOT NULL,
	"run_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"approved_by" text,
	"approved_by_name" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observations" ADD CONSTRAINT "observations_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_summaries" ADD CONSTRAINT "report_summaries_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_summaries" ADD CONSTRAINT "report_summaries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_summaries" ADD CONSTRAINT "report_summaries_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;