import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

// Removes the fictional client used in the phase 1 browser test, with its items and stored files.
async function main() {
  const { db } = await import("../src/lib/db");
  const { clients, items } = await import("../src/lib/db/schema");
  const { removeFile } = await import("../src/lib/storage");
  const { eq, inArray, or, isNull } = await import("drizzle-orm");
  const test = await db.select({ id: clients.id }).from(clients).where(eq(clients.name, "סטודיו נגה עיצוב פנים"));
  const ids = test.map((c) => c.id);
  const its = await db.select({ id: items.id, path: items.storagePath, title: items.title }).from(items)
    .where(ids.length ? or(inArray(items.clientId, ids), isNull(items.clientId)) : isNull(items.clientId));
  for (const it of its) if (it.path) await removeFile(it.path);
  if (its.length) await db.delete(items).where(inArray(items.id, its.map((i) => i.id)));
  if (ids.length) await db.delete(clients).where(inArray(clients.id, ids));
  console.log("removed items:", its.map((i) => i.title), "clients:", ids.length);
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
