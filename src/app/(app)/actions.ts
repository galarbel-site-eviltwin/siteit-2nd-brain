"use server";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { processItem, summarizeClient, summarizeItem } from "@/lib/ai/summarize";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { clientAliases, clients, contacts, items } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { normDomain, normName, normPhone } from "@/lib/ingest/match";
import { requireEmployee } from "@/lib/session";
import { removeFile } from "@/lib/storage";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const list = (s: string) => s.split(/[\n,]+/).map((x) => x.trim()).filter(Boolean);
const isUnique = (e: unknown) => typeof e === "object" && e !== null && "code" in e && (e as { code?: string }).code === "23505";

function aliasRows(clientId: string, name: string, domains: string[], nicknames: string[]) {
  const rows = [
    { clientId, kind: "name" as const, value: normName(name) },
    ...domains.map((d) => ({ clientId, kind: "domain" as const, value: normDomain(d) })),
    ...nicknames.map((n) => ({ clientId, kind: "nickname" as const, value: normName(n) })),
  ].filter((r) => r.value.length >= 2);
  return rows.filter((r, i) => rows.findIndex((x) => x.kind === r.kind && x.value === r.value) === i);
}

export async function createClientAction(form: FormData) {
  const me = await requireEmployee();
  const name = str(form, "name");
  if (!name) redirect("/clients/new?error=name");
  const services = form.getAll("services").map(String).filter((s) => ["seo", "geo", "web"].includes(s));
  const [c] = await db
    .insert(clients)
    .values({ name, services, ownerId: str(form, "ownerId") || me.id, status: "active", notes: str(form, "notes") || null })
    .returning({ id: clients.id });
  try {
    const rows = aliasRows(c.id, name, list(str(form, "domains")), list(str(form, "nicknames")));
    if (rows.length) await db.insert(clientAliases).values(rows);
  } catch (e) {
    await db.delete(clients).where(eq(clients.id, c.id));
    if (isUnique(e)) redirect("/clients/new?error=alias");
    throw e;
  }
  await audit("client_created", me.email, { clientId: c.id, name });
  revalidatePath("/clients");
  const back = str(form, "back");
  redirect(back ? `${back}${back.includes("?") ? "&" : "?"}newClient=${c.id}` : `/clients/${c.id}`);
}

export async function updateClientAction(form: FormData) {
  const me = await requireEmployee();
  const id = str(form, "id");
  const name = str(form, "name");
  if (!id || !name) redirect(`/clients/${id}/edit?error=name`);
  const services = form.getAll("services").map(String).filter((s) => ["seo", "geo", "web"].includes(s));
  const status = (["active", "paused", "archived"] as const).find((s) => s === str(form, "status")) ?? "active";
  await db.update(clients).set({ name, services, status, ownerId: str(form, "ownerId") || null, notes: str(form, "notes") || null, updatedAt: new Date() }).where(eq(clients.id, id));
  // The client's own name is always an alias; keep it in step with renames.
  await db.delete(clientAliases).where(and(eq(clientAliases.clientId, id), eq(clientAliases.kind, "name")));
  try {
    await db.insert(clientAliases).values({ clientId: id, kind: "name", value: normName(name) }).onConflictDoNothing();
  } catch {}
  await audit("client_updated", me.email, { clientId: id });
  revalidatePath(`/clients/${id}`);
  redirect(`/clients/${id}`);
}

export async function addAliasAction(form: FormData) {
  const me = await requireEmployee();
  const clientId = str(form, "clientId");
  const kind = (["domain", "nickname", "phone"] as const).find((k) => k === str(form, "kind")) ?? "nickname";
  const raw = str(form, "value");
  const value = kind === "domain" ? normDomain(raw) : kind === "phone" ? normPhone(raw) : normName(raw);
  if (value.length < 2) redirect(`/clients/${clientId}?error=alias_short`);
  try {
    await db.insert(clientAliases).values({ clientId, kind, value });
  } catch (e) {
    if (isUnique(e)) redirect(`/clients/${clientId}?error=alias`);
    throw e;
  }
  await audit("alias_added", me.email, { clientId, kind, value });
  revalidatePath(`/clients/${clientId}`);
}

export async function removeAliasAction(form: FormData) {
  await requireEmployee();
  const id = str(form, "id"), clientId = str(form, "clientId");
  await db.delete(clientAliases).where(and(eq(clientAliases.id, id), eq(clientAliases.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`);
}

export async function addContactAction(form: FormData) {
  const me = await requireEmployee();
  const clientId = str(form, "clientId");
  const name = str(form, "name");
  if (!name) redirect(`/clients/${clientId}?error=contact`);
  await db.insert(contacts).values({ clientId, name, role: str(form, "role") || null, email: str(form, "email").toLowerCase() || null, phone: str(form, "phone") || null });
  await audit("contact_added", me.email, { clientId, name });
  revalidatePath(`/clients/${clientId}`);
}

export async function removeContactAction(form: FormData) {
  await requireEmployee();
  const id = str(form, "id"), clientId = str(form, "clientId");
  await db.delete(contacts).where(and(eq(contacts.id, id), eq(contacts.clientId, clientId)));
  revalidatePath(`/clients/${clientId}`);
}

// A person confirming, changing or clearing which client an item belongs to.
export async function assignItemAction(form: FormData) {
  const me = await requireEmployee();
  const itemId = str(form, "itemId");
  const clientId = str(form, "clientId");
  const [before] = await db.select({ clientId: items.clientId, assignment: items.assignment }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!before) return;
  if (clientId) await db.update(items).set({ clientId, assignment: "confirmed", assignmentReason: `שויך ע"י ${me.name}` }).where(eq(items.id, itemId));
  else await db.update(items).set({ clientId: null, assignment: "none", assignmentReason: null }).where(eq(items.id, itemId));
  await audit("item_assigned", me.email, { itemId, from: before.clientId, to: clientId || null, wasSuggested: before.assignment === "suggested" });
  revalidatePath("/ingest");
  revalidatePath(`/items/${itemId}`);
  if (clientId) revalidatePath(`/clients/${clientId}`);
  // Both clients' pictures change: the one that gained the item and the one that lost it.
  after(async () => {
    for (const c of new Set([clientId || null, before.assignment === "confirmed" ? before.clientId : null])) if (c) await summarizeClient(c).catch(() => null);
  });
}

export async function summarizeItemAction(form: FormData) {
  await requireEmployee();
  const itemId = str(form, "itemId");
  try {
    await summarizeItem(itemId);
    const [it] = await db.select({ clientId: items.clientId, assignment: items.assignment }).from(items).where(eq(items.id, itemId)).limit(1);
    if (it?.clientId && it.assignment === "confirmed") after(() => summarizeClient(it.clientId!).catch(() => null));
  } catch (e) {
    console.error("summary failed", (e as Error).message);
    redirect(`/items/${itemId}?error=ai`);
  }
  revalidatePath(`/items/${itemId}`);
}

export async function summarizeClientAction(form: FormData) {
  await requireEmployee();
  const clientId = str(form, "clientId");
  try {
    // Items without a summary yet get one first, so the picture covers everything.
    const missing = await db.select({ id: items.id }).from(items).where(and(eq(items.clientId, clientId), eq(items.assignment, "confirmed"), eq(items.status, "ready"))).limit(40);
    for (const m of missing) {
      const [x] = await db.select({ at: items.summarizedAt }).from(items).where(eq(items.id, m.id)).limit(1);
      if (!x?.at) await processItem(m.id);
    }
    await summarizeClient(clientId);
  } catch (e) {
    console.error("client summary failed", (e as Error).message);
    redirect(`/clients/${clientId}?error=ai`);
  }
  revalidatePath(`/clients/${clientId}`);
}

export async function updateItemAction(form: FormData) {
  const me = await requireEmployee();
  const itemId = str(form, "itemId");
  const title = str(form, "title");
  const date = str(form, "occurredAt"); // yyyy-mm-dd from the date input
  const occurredAt = date ? new Date(`${date}T12:00:00+03:00`) : null;
  await db.update(items).set({ ...(title ? { title } : {}), occurredAt }).where(eq(items.id, itemId));
  await audit("item_corrected", me.email, { itemId, title: title || undefined, occurredAt: date || null });
  revalidatePath(`/items/${itemId}`);
}

export async function deleteItemAction(form: FormData) {
  const me = await requireEmployee();
  const itemId = str(form, "itemId");
  const [it] = await db.select({ path: items.storagePath, by: items.createdBy, title: items.title, clientId: items.clientId }).from(items).where(eq(items.id, itemId)).limit(1);
  if (!it) redirect("/ingest");
  if (it.by !== me.id && me.role !== "admin") redirect(`/items/${itemId}?error=forbidden`);
  if (it.path) await removeFile(it.path);
  await db.delete(items).where(eq(items.id, itemId));
  await audit("item_deleted", me.email, { itemId, title: it.title });
  if (it.clientId) after(() => summarizeClient(it.clientId!).catch(() => null));
  revalidatePath("/ingest");
  redirect(it.clientId ? `/clients/${it.clientId}?tab=timeline` : "/ingest");
}

// Several items at once, from the ingest page. Only what this person may delete (their own, or anything for an admin).
export async function bulkDeleteItemsAction(form: FormData) {
  const me = await requireEmployee();
  const ids = [...new Set(form.getAll("itemIds").map(String).filter(Boolean))];
  if (!ids.length) redirect("/ingest");
  const rows = await db.select({ id: items.id, path: items.storagePath, by: items.createdBy, clientId: items.clientId, assignment: items.assignment }).from(items).where(inArray(items.id, ids));
  const allowed = rows.filter((r) => r.by === me.id || me.role === "admin");
  for (const r of allowed) if (r.path) await removeFile(r.path).catch(() => null);
  if (allowed.length) await db.delete(items).where(inArray(items.id, allowed.map((r) => r.id)));
  await audit("items_bulk_deleted", me.email, { count: allowed.length, ids: allowed.map((r) => r.id) });
  const touched = new Set(allowed.filter((r) => r.clientId && r.assignment === "confirmed").map((r) => r.clientId!));
  if (touched.size) after(async () => { for (const c of touched) await summarizeClient(c).catch(() => null); });
  revalidatePath("/ingest");
  revalidatePath("/clients");
  redirect(`/ingest?deleted=${allowed.length}${rows.length > allowed.length ? `&skipped=${rows.length - allowed.length}` : ""}`);
}
