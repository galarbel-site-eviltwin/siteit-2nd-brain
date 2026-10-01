"use server";

import { and, count, eq, ne } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { employees } from "@/lib/db/schema";
import { audit, normalizeEmail } from "@/lib/employees";
import { requireEmployee } from "@/lib/session";

const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// The brain is for SiteIT employees only: a company address is the gate, so freelancers cannot be added by mistake.
const COMPANY = /@eviltwin\.io$/i;

export async function addEmployeeAction(form: FormData) {
  const me = await requireEmployee();
  const name = str(form, "name"), email = normalizeEmail(str(form, "email"));
  if (!name || !email) redirect("/team?error=missing");
  if (!COMPANY.test(email)) redirect("/team?error=domain");
  const [exists] = await db.select({ id: employees.id }).from(employees).where(eq(employees.email, email)).limit(1);
  if (exists) redirect("/team?error=exists");
  await db.insert(employees).values({ name, email, role: str(form, "role") === "admin" ? "admin" : "member" });
  await audit("employee_added", me.email, { email, name });
  revalidatePath("/team");
  redirect("/team?added=1");
}

export async function updateEmployeeAction(form: FormData) {
  const me = await requireEmployee();
  const id = str(form, "id"), name = str(form, "name");
  const role = str(form, "role") === "admin" ? "admin" : "member";
  const [before] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!before) redirect("/team");
  // Someone must always be able to delete any item: the last manager cannot be demoted.
  if (before.role === "admin" && role !== "admin") {
    const [{ n }] = await db.select({ n: count() }).from(employees).where(and(eq(employees.role, "admin"), eq(employees.active, true), ne(employees.id, id)));
    if (!n) redirect("/team?error=last_admin");
  }
  await db.update(employees).set({ name: name || before.name, role }).where(eq(employees.id, id));
  await audit("employee_updated", me.email, { email: before.email, name: name !== before.name ? name : undefined, role: role !== before.role ? role : undefined });
  revalidatePath("/team");
}

// Turning access off is immediate: the next request of that person is refused (sessions are checked against the list).
export async function setActiveAction(form: FormData) {
  const me = await requireEmployee();
  const id = str(form, "id"), active = str(form, "active") === "1";
  if (id === me.id && !active) redirect("/team?error=self");
  const [before] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!before) redirect("/team");
  await db.update(employees).set({ active }).where(eq(employees.id, id));
  await audit(active ? "employee_enabled" : "employee_disabled", me.email, { email: before.email });
  revalidatePath("/team");
}
