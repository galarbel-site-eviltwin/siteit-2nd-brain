"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { notes } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

// Every query is filtered by the signed-in employee: a note id alone never opens someone else's note.
const mine = (id: string, employeeId: string) => and(eq(notes.id, id), eq(notes.employeeId, employeeId));

export async function addNoteAction(form: FormData) {
  const me = await requireEmployee();
  const body = str(form, "body");
  if (!body) return;
  await db.insert(notes).values({ employeeId: me.id, body: body.slice(0, 10_000), clientId: str(form, "clientId") || null });
  revalidatePath("/me");
}

export async function updateNoteAction(form: FormData) {
  const me = await requireEmployee();
  const body = str(form, "body");
  if (!body) return;
  await db.update(notes).set({ body: body.slice(0, 10_000), clientId: str(form, "clientId") || null, updatedAt: new Date() }).where(mine(str(form, "id"), me.id));
  revalidatePath("/me");
}

export async function togglePinAction(form: FormData) {
  const me = await requireEmployee();
  await db.update(notes).set({ pinned: str(form, "pinned") === "1" }).where(mine(str(form, "id"), me.id));
  revalidatePath("/me");
}

export async function deleteNoteAction(form: FormData) {
  const me = await requireEmployee();
  await db.delete(notes).where(mine(str(form, "id"), me.id));
  revalidatePath("/me");
}
