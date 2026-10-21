CREATE TABLE "listening_conversations" (
	"id" text PRIMARY KEY NOT NULL,
	"company_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"consent_at" timestamp NOT NULL,
	"crisis_at" timestamp,
	"themes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_message_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"conversation_id" text NOT NULL,
	"seq" serial NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"crisis" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "listening_themes" (
	"company_id" text NOT NULL,
	"month" text NOT NULL,
	"theme" text NOT NULL,
	"conversations" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "listening_themes_company_id_month_theme_pk" PRIMARY KEY("company_id","month","theme")
);
--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "listening_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "companies" ADD COLUMN "listening_enabled_at" timestamp;--> statement-breakpoint
ALTER TABLE "listening_conversations" ADD CONSTRAINT "listening_conversations_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_messages" ADD CONSTRAINT "listening_messages_conversation_id_listening_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."listening_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listening_themes" ADD CONSTRAINT "listening_themes_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;