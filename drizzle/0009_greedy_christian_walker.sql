CREATE TABLE "import_rows" (
	"id" text PRIMARY KEY NOT NULL,
	"import_id" text NOT NULL,
	"position" integer NOT NULL,
	"column" integer,
	"raw" text NOT NULL,
	"detected" text NOT NULL,
	"value_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"proposed" jsonb NOT NULL,
	"final" jsonb NOT NULL,
	"confidence" integer DEFAULT 0 NOT NULL,
	"engine" text DEFAULT 'regras' NOT NULL,
	"issues" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"action" text DEFAULT 'pending' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"user_id" text,
	"source" text NOT NULL,
	"filename" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'clima' NOT NULL,
	"response_count" integer DEFAULT 0 NOT NULL,
	"import_responses" boolean DEFAULT true NOT NULL,
	"sector_map" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"default_sector_id" text,
	"starts_at" text,
	"ends_at" text,
	"dropped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"data" jsonb,
	"questionnaire_id" text,
	"campaign_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaigns" ADD COLUMN "imported" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_questionnaire_id_questionnaires_id_fk" FOREIGN KEY ("questionnaire_id") REFERENCES "public"."questionnaires"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "imports" ADD CONSTRAINT "imports_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE set null ON UPDATE no action;