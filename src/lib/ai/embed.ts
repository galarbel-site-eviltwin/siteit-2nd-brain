import { embed, embedMany } from "ai";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, items } from "@/lib/db/schema";

// Models go through Vercel AI Gateway, so switching provider is a one-line change.
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const CHAT_MODEL = "anthropic/claude-sonnet-5.5";

// The title travels with each piece, so "the price" in a chat with Noga is found when asking about Noga.
const forEmbedding = (title: string, text: string) => `${title}\n${text}`.slice(0, 6000);

export async function embedQuery(q: string) {
  const { embedding } = await embed({ model: EMBED_MODEL, value: q });
  return embedding;
}

// Pieces that have no vector yet, a batch at a time. Safe to call again: it only picks what is missing.
export async function embedPending(limit = 200, itemId?: string) {
  const rows = await db
    .select({ id: chunks.id, text: chunks.text, title: items.title })
    .from(chunks).innerJoin(items, eq(items.id, chunks.itemId))
    .where(and(isNull(chunks.embedding), itemId ? eq(chunks.itemId, itemId) : undefined))
    .limit(limit);
  for (let i = 0; i < rows.length; i += 64) {
    const batch = rows.slice(i, i + 64);
    const { embeddings } = await embedMany({ model: EMBED_MODEL, values: batch.map((r) => forEmbedding(r.title, r.text)) });
    for (let j = 0; j < batch.length; j++) {
      await db.update(chunks).set({ embedding: embeddings[j] }).where(eq(chunks.id, batch[j].id));
    }
  }
  return rows.length;
}

export async function countPending() {
  const [r] = await db.select({ n: sql<number>`count(*)::int` }).from(chunks).where(isNull(chunks.embedding));
  return r.n;
}
