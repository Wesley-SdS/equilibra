CREATE TABLE "channel_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"message_id" text NOT NULL,
	"report_id" text NOT NULL,
	"mime" text NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_messages" (
	"id" text PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL,
	"seq" serial NOT NULL,
	"author" text NOT NULL,
	"body" text NOT NULL,
	"created_day" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_reports" ADD COLUMN "hr_seen_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "channel_attachments" ADD CONSTRAINT "channel_attachments_message_id_channel_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."channel_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_attachments" ADD CONSTRAINT "channel_attachments_report_id_channel_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."channel_reports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_messages" ADD CONSTRAINT "channel_messages_report_id_channel_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."channel_reports"("id") ON DELETE cascade ON UPDATE no action;