import { db } from "@/lib/db";
import { clientAliases, clients, contacts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export type Suggestion = { clientId: string; reason: string } | null;

// Domains that say nothing about which client a file belongs to.
const NOISE = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "walla.co.il", "yahoo.com", "icloud.com", "eviltwin.io", "siteit.co.il",
  "google.com", "timeless.day", "whatsapp.com", "zoom.us", "meet.google.com", "youtube.com", "facebook.com", "instagram.com", "wa.me", "linkedin.com", "vercel.app"]);

export const normDomain = (s: string) => s.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
export const normPhone = (s: string) => {
  const d = s.replace(/\D/g, "").replace(/^972/, "0");
  return d.length >= 9 ? d.slice(-9) : "";
};
export const normName = (s: string) => s.toLowerCase().replace(/["'׳״`]/g, "").replace(/\s+/g, " ").trim();

const DOMAIN_RE = /\b(?:[a-z0-9-]+\.)+(?:co\.il|org\.il|net\.il|ac\.il|gov\.il|com|net|org|io|co|il|biz|info|shop|store|app|ai)\b/gi;
const EMAIL_RE = /[\w.+-]+@((?:[\w-]+\.)+[\w-]+)/g;
const PHONE_RE = /(?:\+?972[-\s]?|0)(?:[2-9]|5\d)[-\s]?\d{3}[-\s]?\d{4}/g;

/**
 * Suggests the client a new item belongs to, from deterministic signals only: domains, emails,
 * phones and names the team already recorded. Returns a reason a person can check; never confirms.
 */
export async function suggestClient(input: { text: string; title: string; fileName: string; participants: string[] }): Promise<Suggestion> {
  const [aliases, people, names] = await Promise.all([
    db.select().from(clientAliases),
    db.select({ clientId: contacts.clientId, name: contacts.name, email: contacts.email, phone: contacts.phone }).from(contacts),
    db.select({ id: clients.id, name: clients.name }).from(clients).where(eq(clients.status, "active")),
  ]);
  const body = input.text.slice(0, 60_000);
  const lower = body.toLowerCase();
  const head = normName(`${input.title} ${input.fileName}`);
  const who = input.participants.map(normName);

  const domains = new Set<string>();
  for (const m of lower.matchAll(EMAIL_RE)) domains.add(normDomain(m[1]));
  for (const m of lower.matchAll(DOMAIN_RE)) domains.add(normDomain(m[0]));
  [...domains].forEach((d) => NOISE.has(d) && domains.delete(d));
  const phones = new Set([...body.matchAll(PHONE_RE)].map((m) => normPhone(m[0])).filter(Boolean));

  // Points add up per client; the reason shown is the single strongest signal.
  const score = new Map<string, { pts: number; why: string; best: number }>();
  const add = (clientId: string, pts: number, why: string) => {
    const cur = score.get(clientId);
    if (!cur) score.set(clientId, { pts, why, best: pts });
    else { cur.pts += pts; if (pts > cur.best) { cur.best = pts; cur.why = why; } }
  };

  for (const a of aliases) {
    if (a.kind === "domain" && [...domains].some((d) => d === a.value || d.endsWith("." + a.value))) add(a.clientId, 6, `זוהה לפי הדומיין ${a.value}`);
    if (a.kind === "phone" && phones.has(a.value)) add(a.clientId, 6, "זוהה לפי מספר טלפון שמופיע בקובץ");
    if ((a.kind === "name" || a.kind === "nickname") && a.value.length >= 3) {
      if (head.includes(a.value)) add(a.clientId, 5, `השם "${a.value}" מופיע בשם הקובץ`);
      else if (who.some((w) => w.includes(a.value))) add(a.clientId, 4, `"${a.value}" משתתף בשיחה`);
      else if (lower.includes(a.value)) add(a.clientId, 2, `השם "${a.value}" מופיע בתוכן`);
    }
  }
  for (const c of names) {
    const n = normName(c.name);
    if (n.length >= 3 && head.includes(n)) add(c.id, 5, `שם הלקוח מופיע בשם הקובץ`);
  }
  for (const p of people) {
    if (p.email && lower.includes(p.email.toLowerCase())) add(p.clientId, 6, `המייל של ${p.name} מופיע בקובץ`);
    if (p.phone && phones.has(normPhone(p.phone))) add(p.clientId, 6, `הטלפון של ${p.name} מופיע בקובץ`);
    const n = normName(p.name);
    if (n.length >= 2 && who.some((w) => w === n || w.startsWith(n + " ") || n.startsWith(w + " "))) add(p.clientId, 4, `${p.name} משתתף`);
  }

  const ranked = [...score.entries()].sort((a, b) => b[1].pts - a[1].pts);
  const [top, second] = ranked;
  // Only suggest when one client clearly leads: two plausible clients means a person decides.
  if (!top || top[1].pts < 4 || (second && top[1].pts - second[1].pts < 3)) return null;
  return { clientId: top[0], reason: top[1].why };
}
