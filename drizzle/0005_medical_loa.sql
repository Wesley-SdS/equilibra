CREATE TABLE "campaign_contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"channel" text NOT NULL,
	"address" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_contact_unique" UNIQUE("campaign_id","channel","address")
);
--> statement-breakpoint
CREATE TABLE "campaign_dispatches" (
	"id" text PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"kind" text NOT NULL,
	"trigger" text DEFAULT 'manual' NOT NULL,
	"whatsapp_sent" integer DEFAULT 0 NOT NULL,
	"email_sent" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign_contacts" ADD CONSTRAINT "campaign_contacts_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_dispatches" ADD CONSTRAINT "campaign_dispatches_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE cascade ON UPDATE no action;