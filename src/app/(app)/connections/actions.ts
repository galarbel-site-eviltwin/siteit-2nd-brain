"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { syncAccount } from "@/lib/accounts/sync";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { requireEmployee } from "@/lib/session";

const providerOf = (form: FormData) => (String(form.get("provider")) === "microsoft" ? "microsoft" : "google");

export async function syncMineAction(form: FormData) {
  const me = await requireEmployee();
  const [acc] = await db.select().from(accounts).where(and(eq(accounts.employeeId, me.id), eq(accounts.provider, providerOf(form)))).limit(1);
  if (!acc) redirect("/connections");
  const r = await syncAccount(acc, 50_000, 40);
  revalidatePath("/connections");
  revalidatePath("/");
  redirect(r.ok ? "/connections?synced=1" : `/connections?error=${encodeURIComponent(r.reason)}`);
}

// Disconnecting stops reading new mail. What was already learned stays, like with Drive.
export async function disconnectMineAction(form: FormData) {
  const me = await requireEmployee();
  const provider = providerOf(form);
  await db.delete(accounts).where(and(eq(accounts.employeeId, me.id), eq(accounts.provider, provider)));
  await audit("mail_disconnected", me.email, { provider });
  revalidatePath("/connections");
  redirect("/connections");
}
