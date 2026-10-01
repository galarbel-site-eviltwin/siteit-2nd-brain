import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const { db } = await import("../src/lib/db");
  const { sql } = await import("drizzle-orm");
  const r = await db.execute(sql.raw("select status, mime_type, count(*)::int n, (sum(size_bytes)/1048576)::int mb from items group by status, mime_type order by mb desc"));
  console.table(r);
  process.exit(0);
})();
