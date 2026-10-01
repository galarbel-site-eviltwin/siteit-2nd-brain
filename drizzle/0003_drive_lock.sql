ALTER TABLE "connections" ADD COLUMN "last_result" jsonb;--> statement-breakpoint
ALTER TABLE "connections" ADD COLUMN "locked_until" timestamp with time zone;