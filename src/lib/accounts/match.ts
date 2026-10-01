import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientAliases, contacts } from "@/lib/db/schema";
import { NOISE, normDomain } from "@/lib/ingest/match";

// Who the brain may read mail about: the domains and contact addresses people gave each client.
// A mail with none of these is never fetched, so personal and internal mail stays out.
export async function clientIndex() {
  const domains = new Map<string, string>();
  const emails = new Map<string, string>();
  for (const a of await db.select({ clientId: clientAliases.clientId, value: clientAliases.value }).from(clientAliases).where(eq(clientAliases.kind, "domain"))) {
    const d = normDomain(a.value);
    if (d && !NOISE.has(d)) domains.set(d, a.clientId);
  }
  for (const c of await db.select({ clientId: contacts.clientId, email: contacts.email }).from(contacts)) {
    if (c.email && c.email.includes("@")) emails.set(c.email.trim().toLowerCase(), c.clientId);
  }
  return { domains, emails };
}

export type ClientIndex = Awaited<ReturnType<typeof clientIndex>>;

// "Noga <noga@studio.co.il>, dani@eviltwin.io" -> [{ name, email }]
export function parseAddresses(s: string) {
  const out: { name: string | null; email: string }[] = [];
  for (const m of s.matchAll(/(?:"?([^",<]*?)"?\s*)?<?([\w.+-]+@[\w-]+(?:\.[\w-]+)+)>?/g)) {
    out.push({ name: m[1]?.trim() || null, email: m[2].toLowerCase() });
  }
  return out;
}

// The client most of these addresses belong to, by exact contact address first and then by domain.
export function matchClient(addresses: string[], idx: ClientIndex) {
  const votes = new Map<string, { n: number; why: string }>();
  for (const e of addresses) {
    const byEmail = idx.emails.get(e);
    const domain = e.split("@")[1] ?? "";
    const id = byEmail ?? idx.domains.get(domain) ?? idx.domains.get(domain.split(".").slice(-3).join(".")) ?? idx.domains.get(domain.split(".").slice(-2).join("."));
    if (!id) continue;
    const v = votes.get(id) ?? { n: 0, why: byEmail ? `כתובת של איש קשר (${e})` : `הדומיין ${domain}` };
    v.n += byEmail ? 2 : 1;
    votes.set(id, v);
  }
  const best = [...votes.entries()].sort((a, b) => b[1].n - a[1].n)[0];
  return best ? { clientId: best[0], reason: best[1].why } : null;
}

// Gmail search for "any message from or to these clients", in pieces small enough for one query.
export function gmailQueries(idx: ClientIndex, extra: string) {
  const terms = [...[...idx.domains.keys()].map((d) => d), ...idx.emails.keys()];
  const out: string[] = [];
  for (let i = 0; i < terms.length; i += 12) {
    const part = terms.slice(i, i + 12).flatMap((t) => [`from:${t}`, `to:${t}`, `cc:${t}`]).join(" ");
    out.push(`{${part}} ${extra}`.trim());
  }
  return out;
}
