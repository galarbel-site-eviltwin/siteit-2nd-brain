CREATE TYPE "public"."evidence_kind" AS ENUM('explicit', 'reported', 'inferred');--> statement-breakpoint
CREATE TYPE "public"."fact_kind" AS ENUM('decision', 'commitment', 'price', 'deadline', 'request');--> statement-breakpoint
CREATE TYPE "public"."fact_status" AS ENUM('auto', 'pending', 'approved', 'corrected', 'rejected');--> statement-breakpoint
CREATE TABLE "facts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid,
	"item_id" uuid NOT NULL,
	"kind" "fact_kind" NOT NULL,
	"text" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"evidence" "evidence_kind" NOT NULL,
	"quote" text,
	"seqs" integer[] DEFAULT '{}' NOT NULL,
	"status" "fact_status" DEFAULT 'pending' NOT NULL,
	"done" boolean DEFAULT false NOT NULL,
	"occurred_at" timestamp with time zone,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "facts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "extracted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "facts" ADD CONSTRAINT "facts_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "facts_client" ON "facts" USING btree ("client_id","kind");--> statement-breakpoint
CREATE INDEX "facts_status" ON "facts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "facts_item" ON "facts" USING btree ("item_id");