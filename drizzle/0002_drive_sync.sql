CREATE TYPE "public"."folder_status" AS ENUM('pending', 'mapped', 'ignored');--> statement-breakpoint
ALTER TYPE "public"."item_source" ADD VALUE 'drive';--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"provider" text NOT NULL,
	"owner_id" uuid,
	"account_email" text,
	"token_enc" text,
	"config" jsonb,
	"last_sync_at" timestamp with time zone,
	"last_success_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_provider_unique" UNIQUE("provider")
);
--> statement-breakpoint
ALTER TABLE "connections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drive_files" (
	"file_id" text PRIMARY KEY NOT NULL,
	"folder_id" text NOT NULL,
	"item_id" uuid,
	"name" text NOT NULL,
	"version" text,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"skipped" text
);
--> statement-breakpoint
ALTER TABLE "drive_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "drive_folders" (
	"folder_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"status" "folder_status" DEFAULT 'pending' NOT NULL,
	"client_id" uuid,
	"suggested_client_id" uuid,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "drive_folders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "connections" ADD CONSTRAINT "connections_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_files" ADD CONSTRAINT "drive_files_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drive_folders" ADD CONSTRAINT "drive_folders_suggested_client_id_clients_id_fk" FOREIGN KEY ("suggested_client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "drive_files_folder" ON "drive_files" USING btree ("folder_id");