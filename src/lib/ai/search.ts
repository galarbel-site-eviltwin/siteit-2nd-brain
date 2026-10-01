import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { embedQuery } from "./embed";

export type Source = {
  ref: string; // short id the answer cites: first 8 characters of the piece id
  chunkId: string; itemId: string; seq: number; text: string; speaker: string | null; startMs: number | null; at: string | null;
  title: string; kind: string; source: string; occurredAt: string | null; clientId: string | null; clientName: string | null;
};

export type Scope = { clientId?: string | null; from?: string | null; to?: string | null };

// Words that carry no meaning on their own in a question, including "what did X say in the last chat".
const STOP = new Set(["של", "את", "על", "עם", "מה", "מי", "זה", "זו", "איך", "למה", "הוא", "היא", "לא", "כן", "אם", "או", "גם", "יש", "אין", "היה", "הם", "אני", "אנחנו", "לגבי", "כל", "אז", "כי", "רק", "עוד", "הזה", "הזאת", "שלנו", "שלו", "שלה", "אמר", "אמרה", "אמרו", "כתב", "כתבה", "שיחה", "בשיחה", "השיחה", "פגישה", "בפגישה", "הפגישה", "האחרונה", "האחרון", "אחרונה", "אחרון", "לקוח", "הלקוח", "קרה", "דיבר", "דיברנו", "תגיד", "תסכם", "סכם", "the", "and", "for", "what", "who", "how", "last"]);

export function words(q: string) {
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

const toSource = (row: Row): Source => ({
  ...row,
  ref: row.chunkId.slice(0, 8),
  at: row.at ? new Date(row.at).toISOString() : null,
  occurredAt: row.occurredAt ? new Date(row.occurredAt).toISOString() : null,
});

// A whole word, allowing Hebrew prefixes (ו, ה, ב, ל, מ, ש, כ): "בן" must not match inside "מבנה".
const escapeRe = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const wordRe = (w: string) => `(^|[^א-תa-z0-9])[והבלמשכ]{0,2}${escapeRe(w)}`;

// Hybrid search: meaning (vectors) and exact words (names, numbers, domains), merged by rank (RRF).
// If vectors are unavailable the word search still answers, so "sources only" never goes dark.
export async function searchSources(query: string, scope: Scope = {}, limit = 12): Promise<Source[]> {
  const ws = words(query);
  const hit = (w: string) => sql`(lower(c.text) ~ ${wordRe(w)} or lower(i.title) ~ ${wordRe(w)})`;
  // With several words, a piece must carry at least two of them, not just one common word.
  const need = ws.length >= 3 ? 2 : 1;
  const byWords = ws.length
    ? ((await db.execute(sql`
        select * from (
          select ${COLS}, (${sql.join(ws.map((w) => sql`(case when ${hit(w)} then 1 else 0 end)`), sql` + `)}) as hits,
            coalesce(c.at, i.occurred_at, i.recorded_at) as sort_at
          from chunks c join items i on i.id = c.item_id left join clients cl on cl.id = i.client_id
          where ${scopeSql(scope)}
        ) t where hits >= ${need}
        order by hits desc, sort_at desc limit 30`)) as unknown as Row[])
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
  return [...score.values()].sort((a, b) => b.s - a.s).slice(0, limit).map(({ row }) => toSource(row));
}

// The pieces of one client, newest first: the answer to "what did X say lately" when no topic is given.
export async function latestFor(clientId: string, limit = 12): Promise<Source[]> {
  const rows = (await db.execute(sql`
    select ${COLS} from chunks c join items i on i.id = c.item_id left join clients cl on cl.id = i.client_id
    where ${scopeSql({ clientId })}
    order by coalesce(c.at, i.occurred_at, i.recorded_at) desc, c.seq desc limit ${limit}`)) as unknown as Row[];
  return rows.map(toSource);
}

// Words in client names that do not identify anyone on their own.
const GENERIC = new Set(["google", "ppc", "seo", "geo", "web", "ltd", "בע\"מ", "פרופ׳", "פרופ'", "פרופ", "ד\"ר", "דר", "דוקטור", "עו\"ד", "קידום", "אורגני", "בניית", "אתרים", "אתר"]);

// Which client a question is about, from the names, nicknames and domains the brain knows.
export async function detectClient(query: string) {
  const q = ` ${query.toLowerCase()} `;
  const rows = (await db.execute(sql`
    select c.id, c.name, coalesce(array_agg(a.value) filter (where a.kind in ('nickname', 'domain')), '{}') as alts
    from clients c left join client_aliases a on a.client_id = c.id group by c.id`)) as unknown as { id: string; name: string; alts: string[] }[];
  let best: { id: string; name: string; score: number; used: string[] } | null = null;
  for (const c of rows) {
    const tokens = c.name.toLowerCase().split(/[\s\-+|,()]+/).filter((t) => t.length >= 2 && !GENERIC.has(t));
    const used = tokens.filter((t) => new RegExp(`${wordRe(t)}($|[^א-תa-z0-9])`).test(q));
    // A multi-word name needs two of its words ("גיא בן סימון"), a one-word name just that word ("infinidome").
    let score = tokens.length && used.length >= Math.min(2, tokens.length) ? used.length : 0;
    for (const alt of c.alts ?? []) {
      const bare = alt.toLowerCase().replace(/\.(co\.il|org\.il|com|net|io|co)$/, "");
      if (bare.length >= 3 && q.includes(bare)) { score += 2; used.push(bare); }
    }
    if (score && (!best || score > best.score)) best = { id: c.id, name: c.name, score, used };
  }
  if (!best) return null;
  // The name itself is not what to look for inside the client's own pieces.
  const rest = best.used.reduce((s, t) => s.replace(new RegExp(wordRe(t), "g"), "$1 "), query.toLowerCase());
  return { id: best.id, name: best.name, rest };
}

// "Sources only": find the client in the question, search inside it, and if no topic is left, show its latest.
export async function findForPerson(query: string, clientId?: string | null) {
  const found = clientId ? null : await detectClient(query);
  const scopeId = clientId || found?.id || null;
  const rest = found ? found.rest : query;
  const sources = words(rest).length ? await searchSources(rest, { clientId: scopeId }, 20) : scopeId ? await latestFor(scopeId, 12) : [];
  return { sources, client: found ? { id: found.id, name: found.name } : null };
}
