CREATE TYPE "public"."account_provider" AS ENUM('google', 'microsoft');--> statement-breakpoint
ALTER TYPE "public"."item_kind" ADD VALUE 'email';--> statement-breakpoint
ALTER TYPE "public"."item_source" ADD VALUE 'gmail';--> statement-breakpoint
ALTER TYPE "public"."item_source" ADD VALUE 'outlook';--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"employee_id" uuid NOT NULL,
	"provider" "account_provider" NOT NULL,
	"email" text NOT NULL,
	"token_enc" text NOT NULL,
	"scopes" text,
	"mail_state" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_error" text,
	"last_result" jsonb,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"title" text NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false NOT NULL,
	"attendees" text[] DEFAULT '{}' NOT NULL,
	"location" text,
	"link" text,
	"client_id" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mail_threads" (
	"account_id" uuid NOT NULL,
	"thread_id" text NOT NULL,
	"item_id" uuid,
	"message_count" integer DEFAULT 0 NOT NULL,
	"skipped" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "mail_threads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mail_threads" ADD CONSTRAINT "mail_threads_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_employee_provider" ON "accounts" USING btree ("employee_id","provider");--> statement-breakpoint
CREATE UNIQUE INDEX "events_key" ON "events" USING btree ("account_id","external_id");--> statement-breakpoint
CREATE INDEX "events_start" ON "events" USING btree ("start_at");--> statement-breakpoint
CREATE INDEX "events_client" ON "events" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mail_threads_key" ON "mail_threads" USING btree ("account_id","thread_id");