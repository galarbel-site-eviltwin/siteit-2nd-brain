import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { embedQuery } from "./embed";

export type Source = {
  ref: string; // short id the answer cites: first 8 characters of the piece id
  chunkId: string; itemId: string; seq: number; text: string; speaker: string | null; startMs: number | null; at: string | null;
  title: string; kind: string; source: string; occurredAt: string | null; clientId: string | null; clientName: string | null;
};

export type Scope = { clientId?: string | null; from?: string | null; to?: string | null };

// Words that carry no meaning on their own in a Hebrew question.
const STOP = new Set(["של", "את", "על", "עם", "מה", "מי", "זה", "זו", "איך", "למה", "הוא", "היא", "לא", "כן", "אם", "או", "גם", "יש", "אין", "היה", "הם", "אני", "אנחנו", "לגבי", "כל", "אז", "כי", "רק", "עוד", "הזה", "הזאת", "שלנו", "שלו", "שלה", "the", "and", "for", "what", "who", "how"]);

function words(q: string) {
  return [...new Set(q.toLowerCase().split(/[^\p{L}\p{N}.@-]+/u).map((w) => w.replace(/^[.-]+|[.-]+$/g, "")).filter((w) => w.length >= 2 && !STOP.has(w)))].slice(0, 8);
}

const scopeSql = (s: Scope) => sql`
  i.status = 'ready'
  ${s.clientId ? sql`and i.client_id = ${s.clientId} and i.assignment = 'confirmed'` : sql``}
  ${s.from ? sql`and coalesce(c.at, i.occurred_at, i.recorded_at) >= ${s.from}::timestamptz` : sql``}
  ${s.to ? sql`and coalesce(c.at, i.occurred_at, i.recorded_at) < (${s.to}::date + 1)::timestamptz` : sql``}`;

const COLS = sql`c.id as "chunkId", c.item_id as "itemId", c.seq, c.text, c.speaker, c.start_ms as "startMs", c.at,
  i.title, i.kind, i.source, i.occurred_at as "occurredAt", i.client_id as "clientId", cl.name as "clientName"`;

type Row = Omit<Source, "ref">;

// Hybrid search: meaning (vectors) and exact words (names, numbers, domains), merged by rank (RRF).
// If vectors are unavailable the word search still answers, so "sources only" never goes dark.
export async function searchSources(query: string, scope: Scope = {}, limit = 12): Promise<Source[]> {
  const ws = words(query);
  const byWords = ws.length
    ? ((await db.execute(sql`
        select ${COLS}, (${sql.join(ws.map((w) => sql`(case when c.text ilike ${"%" + w + "%"} or i.title ilike ${"%" + w + "%"} then 1 else 0 end)`), sql` + `)}) as hits
        from chunks c join items i on i.id = c.item_id left join clients cl on cl.id = i.client_id
        where ${scopeSql(scope)} and (${sql.join(ws.map((w) => sql`c.text ilike ${"%" + w + "%"} or i.title ilike ${"%" + w + "%"}`), sql` or `)})
        order by hits desc, coalesce(c.at, i.occurred_at, i.recorded_at) desc limit 30`)) as unknown as Row[])
    : [];

  let byMeaning: Row[] = [];
  try {
    const v = `[${(await embedQuery(query)).join(",")}]`;
    byMeaning = (await db.execute(sql`
      select ${COLS} from chunks c join items i on i.id = c.item_id left join clients cl on cl.id = i.client_id
      where ${scopeSql(scope)} and c.embedding is not null
      order by c.embedding <=> ${v}::vector limit 30`)) as unknown as Row[];
  } catch {
    // No vectors (no embeddings provider yet): the word search alone answers.
  }

  const score = new Map<string, { row: Row; s: number }>();
  for (const list of [byMeaning, byWords]) {
    list.forEach((row, rank) => {
      const cur = score.get(row.chunkId) ?? { row, s: 0 };
      cur.s += 1 / (60 + rank);
      score.set(row.chunkId, cur);
    });
  }
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, limit).map(({ row }) => ({
    ...row,
    ref: row.chunkId.slice(0, 8),
    at: row.at ? new Date(row.at).toISOString() : null,
    occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null,
  }));
}
