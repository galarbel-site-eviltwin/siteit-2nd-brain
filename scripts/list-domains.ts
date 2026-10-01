import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const { db } = await import("../src/lib/db");
  const { driveFolders } = await import("../src/lib/db/schema");
  const rows = await db.select({ name: driveFolders.name, domain: driveFolders.domain }).from(driveFolders);
  for (const r of rows.filter((r) => r.domain)) console.log(`${r.domain}  <=  ${r.name}`);
  process.exit(0);
})();
