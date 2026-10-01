import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientAliases, driveFolders } from "@/lib/db/schema";
import { DOMAIN_RE, NOISE, normDomain } from "@/lib/ingest/match";

// Sites that show up in everyone's documents and say nothing about who the client is.
const COMMON = /(^|\.)(google|googleapis|gstatic|facebook|fb|instagram|youtube|youtu|linkedin|twitter|x|tiktok|whatsapp|wa|zoom|bit|wix|wixsite|wordpress|w3|schema|apple|microsoft|office|live|outlook|gmail|semrush|ahrefs|moz|similarweb|elementor|cloudflare|amazonaws|github|canva|figma|calendly|waze|mailchimp|hubspot|monday|asana|notion|dropbox|shutterstock|unsplash|wikipedia|eviltwin|siteit|timeless|vercel)\.[a-z.]+$/;

// A client with no known website, but whose own chats, reports and documents keep naming one: that is its site.
// Only a clear winner counts (seen in two or more pieces, and twice as often as the runner-up).
export async function discoverDomains() {
  const rows = (await db.execute(sql`
    select c.id, string_agg(left(ch.text, 4000), ' ') as text
    from clients c
    join items i on i.client_id = c.id and i.assignment = 'confirmed'
    join chunks ch on ch.item_id = i.id
    where not exists (select 1 from client_aliases a where a.client_id = c.id and a.kind = 'domain')
    group by c.id`)) as unknown as { id: string; text: string }[];
  const found: { clientId: string; domain: string }[] = [];
  for (const r of rows) {
    const tally = new Map<string, number>();
    for (const m of (r.text ?? "").toLowerCase().matchAll(DOMAIN_RE)) {
      const d = normDomain(m[0]);
      if (!d || NOISE.has(d) || COMMON.test(d) || /\.(pdf|docx?|xlsx?|png|jpe?g)$/.test(d)) continue;
      tally.set(d, (tally.get(d) ?? 0) + 1);
    }
    const [first, second] = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    if (first && first[1] >= 2 && (!second || first[1] >= second[1] * 2)) {
      await db.insert(clientAliases).values({ clientId: r.id, kind: "domain", value: first[0] }).onConflictDoNothing();
      await db.update(driveFolders).set({ domain: first[0] }).where(eq(driveFolders.clientId, r.id));
      found.push({ clientId: r.id, domain: first[0] });
    }
  }
  return found;
}
