import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
(async () => {
  const { db } = await import("../src/lib/db");
  const { driveFolders } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  await db.update(driveFolders).set({ domain: null }); void eq;
  const { syncDrive } = await import("../src/lib/drive/sync");
  console.log(await syncDrive({ budgetMs: 270_000, maxFiles: 0 }));
  const rows = await db.select({ domain: driveFolders.domain }).from(driveFolders);
  console.log("with site:", rows.filter((r) => r.domain).length, "none:", rows.filter((r) => r.domain === "").length, "not yet:", rows.filter((r) => r.domain === null).length);
  process.exit(0);
})();
