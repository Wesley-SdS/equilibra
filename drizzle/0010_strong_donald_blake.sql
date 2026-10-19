CREATE TABLE "campaign_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"employee_id" text NOT NULL,
	"token" text NOT NULL,
	"invited_at" timestamp,
	"reminded_at" timestamp,
	"consent_at" timestamp,
	"responded_at" timestamp,
	CONSTRAINT "campaign_participants_token_unique" UNIQUE("token"),
	CONSTRAINT "campaign_participant_unique" UNIQUE("campaign_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text,
	"phone" text,
	"sector_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "response_identities" (
	"response_id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"employee_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD COLUMN "employee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_participants" ADD CONSTRAINT "campaign_participants_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_sector_id_sectors_id_fk" FOREIGN KEY ("sector_id") REFERENCES "public"."sectors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_identities" ADD CONSTRAINT "response_identities_response_id_responses_id_fk" FOREIGN KEY ("response_id") REFERENCES "public"."responses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_identities" ADD CONSTRAINT "response_identities_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "response_identities" ADD CONSTRAINT "response_identities_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;