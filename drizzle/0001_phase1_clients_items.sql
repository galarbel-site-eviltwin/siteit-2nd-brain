CREATE TYPE "public"."alias_kind" AS ENUM('name', 'domain', 'nickname', 'phone');--> statement-breakpoint
CREATE TYPE "public"."assignment_status" AS ENUM('none', 'suggested', 'confirmed');--> statement-breakpoint
CREATE TYPE "public"."client_status" AS ENUM('active', 'paused', 'archived');--> statement-breakpoint
CREATE TYPE "public"."ingest_status" AS ENUM('processing', 'ready', 'stored', 'failed');--> statement-breakpoint
CREATE TYPE "public"."item_kind" AS ENUM('meeting', 'chat', 'document', 'voice_note', 'note');--> statement-breakpoint
CREATE TYPE "public"."item_source" AS ENUM('timeless', 'whatsapp', 'upload', 'manual');--> statement-breakpoint
CREATE TABLE "chunks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"text" text NOT NULL,
	"speaker" text,
	"start_ms" integer,
	"at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "chunks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "client_aliases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"kind" "alias_kind" NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "client_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"status" "client_status" DEFAULT 'active' NOT NULL,
	"services" text[] DEFAULT '{}' NOT NULL,
	"owner_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "clients" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"role" text,
	"email" text,
	"phone" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "item_kind" NOT NULL,
	"source" "item_source" NOT NULL,
	"title" text NOT NULL,
	"client_id" uuid,
	"assignment" "assignment_status" DEFAULT 'none' NOT NULL,
	"assignment_reason" text,
	"occurred_at" timestamp with time zone,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"file_name" text,
	"mime_type" text,
	"size_bytes" integer,
	"storage_path" text,
	"content_hash" text,
	"status" "ingest_status" DEFAULT 'processing' NOT NULL,
	"error" text,
	"participants" text[] DEFAULT '{}' NOT NULL,
	"meta" jsonb
);
--> statement-breakpoint
ALTER TABLE "items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "client_aliases" ADD CONSTRAINT "client_aliases_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_owner_id_employees_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_created_by_employees_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."employees"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chunks_item" ON "chunks" USING btree ("item_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "client_aliases_kind_value" ON "client_aliases" USING btree ("kind","value");--> statement-breakpoint
CREATE INDEX "client_aliases_client" ON "client_aliases" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "contacts_client" ON "contacts" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "items_client" ON "items" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "items_hash" ON "items" USING btree ("content_hash");--> statement-breakpoint
CREATE INDEX "items_recorded" ON "items" USING btree ("recorded_at");