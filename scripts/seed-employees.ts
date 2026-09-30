import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

// The approved list from docs/decisions.md. Re-running is safe: existing rows keep
// their active flag and login history, only name and role are refreshed.
const people = [
  { email: "galarbel@eviltwin.io", name: "גל ארבל", role: "member" },
  { email: "dani@eviltwin.io", name: "דני שקד", role: "admin" },
  { email: "maya@eviltwin.io", name: "מיה הלוי", role: "member" },
  { email: "itay@eviltwin.io", name: "איתי אלימור", role: "member" },
  { email: "ben@eviltwin.io", name: "בן דיין", role: "member" },
] as const;

async function main() {
  const { db } = await import("../src/lib/db");
  const { employees } = await import("../src/lib/db/schema");
  const { sql } = await import("drizzle-orm");
  for (const p of people) {
    await db
      .insert(employees)
      .values(p)
      .onConflictDoUpdate({ target: employees.email, set: { name: p.name, role: p.role } });
  }
  const rows = await db.select({ email: employees.email, role: employees.role, active: employees.active }).from(employees).orderBy(sql`email`);
  console.table(rows);
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
