import { eq } from "drizzle-orm";
import { db } from "./db";
import { auditLog, employees, type Employee } from "./db/schema";

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

export async function findEmployee(email: string | null | undefined): Promise<Employee | null> {
  if (!email) return null;
  const [row] = await db.select().from(employees).where(eq(employees.email, normalizeEmail(email))).limit(1);
  return row ?? null;
}

export async function markLogin(id: string) {
  await db.update(employees).set({ lastLoginAt: new Date() }).where(eq(employees.id, id));
}

export async function audit(action: string, actorEmail: string | null, detail?: Record<string, unknown>) {
  await db.insert(auditLog).values({ action, actorEmail, detail: detail ?? null });
}
