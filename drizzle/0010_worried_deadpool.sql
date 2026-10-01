ALTER TABLE "items" ADD COLUMN "topic" text;--> statement-breakpoint
CREATE INDEX "items_topic" ON "items" USING btree ("topic");