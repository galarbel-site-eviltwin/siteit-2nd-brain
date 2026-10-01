import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());

// Lists client folders and looks for their websites, without ingesting any file.
(async () => {
  const { syncDrive } = await import("../src/lib/drive/sync");
  const { db } = await import("../src/lib/db");
  const { driveFolders } = await import("../src/lib/db/schema");
  console.log(await syncDrive({ budgetMs: 180_000, maxFiles: 0 }));
  const rows = await db.select({ domain: driveFolders.domain }).from(driveFolders);
  console.log("folders:", rows.length, "with site:", rows.filter((r) => r.domain).length, "looked, none:", rows.filter((r) => r.domain === "").length, "not yet:", rows.filter((r) => r.domain === null).length);
  process.exit(0);
})();
