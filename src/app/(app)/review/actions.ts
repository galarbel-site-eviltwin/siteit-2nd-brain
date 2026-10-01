"use server";

import { eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { facts, type FactRevision } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { requireEmployee } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

function done(clientId?: string | null) {
  revalidatePath("/review");
  if (clientId) revalidatePath(`/clients/${clientId}`);
}

async function load(id: string) {
  const [f] = await db.select().from(facts).where(eq(facts.id, id)).limit(1);
  return f ?? null;
}

const snapshot = (f: typeof facts.$inferSelect, by: string): FactRevision => ({ at: new Date().toISOString(), by, text: f.text, details: f.details, status: f.status });

export async function approveFactAction(form: FormData) {
  const me = await requireEmployee();
  const f = await load(str(form, "id"));
  if (!f) return;
  await db.update(facts).set({ status: "approved", reviewedBy: me.name, reviewedAt: new Date() }).where(eq(facts.id, f.id));
  await audit("fact_approved", me.email, { factId: f.id });
  done(f.clientId);
}

export async function rejectFactAction(form: FormData) {
  const me = await requireEmployee();
  const f = await load(str(form, "id"));
  if (!f) return;
  await db.update(facts).set({ status: "rejected", reviewedBy: me.name, reviewedAt: new Date(), history: [...f.history, snapshot(f, me.name)] }).where(eq(facts.id, f.id));
  await audit("fact_rejected", me.email, { factId: f.id });
  done(f.clientId);
}

// A correction replaces the wording or the numbers, and keeps what the brain wrote in the history.
export async function correctFactAction(form: FormData) {
  const me = await requireEmployee();
  const f = await load(str(form, "id"));
  if (!f) return;
  const text = str(form, "text") || f.text;
  const amountRaw = str(form, "amount").replace(/[,\s₪$€]/g, "");
  const details = { ...f.details, amount: amountRaw ? Number(amountRaw) || f.details.amount : f.details.amount, dueDate: str(form, "dueDate") || f.details.dueDate || null };
  await db.update(facts).set({ text, details, status: "corrected", reviewedBy: me.name, reviewedAt: new Date(), history: [...f.history, snapshot(f, me.name)] }).where(eq(facts.id, f.id));
  await audit("fact_corrected", me.email, { factId: f.id });
  done(f.clientId);
}

export async function toggleDoneAction(form: FormData) {
  const me = await requireEmployee();
  const f = await load(str(form, "id"));
  if (!f) return;
  await db.update(facts).set({ done: !f.done }).where(eq(facts.id, f.id));
  await audit(f.done ? "commitment_reopened" : "commitment_done", me.email, { factId: f.id });
  done(f.clientId);
}

// Approve everything checked at once: for a queue that filled up after a big import.
export async function approveManyAction(form: FormData) {
  const me = await requireEmployee();
  const ids = form.getAll("ids").map(String).filter(Boolean);
  if (!ids.length) return;
  await db.update(facts).set({ status: "approved", reviewedBy: me.name, reviewedAt: new Date() }).where(inArray(facts.id, ids));
  await audit("facts_bulk_approved", me.email, { count: ids.length });
  done();
}
