import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
// A quick count of what the brain holds. Counts only, no content.
(async () => {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const q = async (s: string) => (await db.execute(sql.raw(s))) as unknown as Record<string, unknown>[];
  console.log("clients:", (await q("select count(*)::int n from clients"))[0].n);
  console.log("drive folders:", await q("select status, count(*)::int n from drive_folders group by status"));
  console.log("items:", await q("select source, status, count(*)::int n from items group by source, status order by n desc"));
  console.log("chunks:", (await q("select count(*)::int n from chunks"))[0].n);
  console.log("files:", (await q("select count(*)::int n, coalesce(sum(size_bytes),0)::bigint bytes from items"))[0]);
  process.exit(0);
})();
