CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint
ALTER TABLE "chunks" ADD COLUMN "embedding" vector(1536);--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "clients" ADD COLUMN "summarized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "items" ADD COLUMN "summarized_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "chunks_embedding" ON "chunks" USING hnsw ("embedding" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chunks_trgm" ON "chunks" USING gin ("text" gin_trgm_ops);