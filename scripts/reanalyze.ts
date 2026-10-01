import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
// Reads every readable item again with the current rules. Titles and kinds only, no content printed.
(async () => {
  const { db } = await import("../src/lib/db");
  const { items } = await import("../src/lib/db/schema");
  const { eq } = await import("drizzle-orm");
  const { reanalyzeItem } = await import("../src/lib/ingest/reanalyze");
  const rows = await db.select({ id: items.id, kind: items.kind, source: items.source }).from(items).where(eq(items.status, "ready"));
  for (const r of rows) {
    const res = await reanalyzeItem(r.id).catch((e) => ({ ok: false as const, reason: String(e) }));
    console.log(r.kind, r.source, "->", res.ok ? `${res.kind} ${res.source}` : `skipped (${res.reason})`);
  }
  process.exit(0);
})();
