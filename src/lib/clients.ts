import { and, count, desc, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "./db";
import { clientAliases, clients, employees, items } from "./db/schema";

export const SERVICES = { seo: "קידום SEO", geo: "GEO", web: "בניית אתרים" } as const;
export type Service = keyof typeof SERVICES;

export const STATUS = { active: "פעיל", paused: "מושהה", archived: "בארכיון" } as const;

// A stable color per client, from the brand palette, so the same client always looks the same.
const MONO = ["#0878AA", "#0E9E63", "#C79A00", "#311C57", "#CF0559", "#452A73", "#01A3E6", "#D9148A"];
export const monoColor = (id: string) => MONO[[...id].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7) % MONO.length];

export async function listClients() {
  const rows = await db
    .select({
      id: clients.id, name: clients.name, status: clients.status, services: clients.services, ownerName: employees.name,
      itemCount: sql<number>`(select count(*)::int from ${items} where ${items.clientId} = ${clients.id} and ${items.assignment} = 'confirmed')`,
      pending: sql<number>`(select count(*)::int from ${items} where ${items.clientId} = ${clients.id} and ${items.assignment} = 'suggested')`,
      lastAt: sql<Date | null>`(select max(coalesce(${items.occurredAt}, ${items.recordedAt})) from ${items} where ${items.clientId} = ${clients.id} and ${items.assignment} = 'confirmed')`,
    })
    .from(clients)
    .leftJoin(employees, eq(employees.id, clients.ownerId))
    .orderBy(clients.name);
  const domains = await db.select({ clientId: clientAliases.clientId, value: clientAliases.value }).from(clientAliases).where(eq(clientAliases.kind, "domain"));
  return rows.map((r) => ({ ...r, lastAt: r.lastAt ? new Date(r.lastAt) : null, domain: domains.find((d) => d.clientId === r.id)?.value ?? null }));
}

export async function clientOptions() {
  return db.select({ id: clients.id, name: clients.name }).from(clients).where(inArray(clients.status, ["active", "paused"])).orderBy(clients.name);
}

export async function pendingCount() {
  const [r] = await db.select({ n: count() }).from(items).where(and(inArray(items.assignment, ["none", "suggested"]), inArray(items.status, ["ready", "stored"])));
  return r?.n ?? 0;
}

export async function lastActivity() {
  const [r] = await db.select({ at: max(items.recordedAt) }).from(items);
  return r?.at ?? null;
}

export const recentItems = (limit = 40) =>
  db
    .select({
      id: items.id, title: items.title, kind: items.kind, source: items.source, status: items.status, error: items.error, assignment: items.assignment,
      assignmentReason: items.assignmentReason, clientId: items.clientId, clientName: clients.name, occurredAt: items.occurredAt, recordedAt: items.recordedAt,
      meta: items.meta, participants: items.participants,
    })
    .from(items)
    .leftJoin(clients, eq(clients.id, items.clientId))
    .orderBy(desc(items.recordedAt))
    .limit(limit);
