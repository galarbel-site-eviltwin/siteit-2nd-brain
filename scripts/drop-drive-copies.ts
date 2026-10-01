import { loadEnvConfig } from "@next/env";
loadEnvConfig(process.cwd());
// One-off: Drive originals used to be copied into Storage. Remove those copies.
// Items with text stay and point to Drive; items without text are removed (their files stay in Drive).
// Dry run by default; pass --apply to change anything.
(async () => {
  const apply = process.argv.includes("--apply");
  const { db } = await import("../src/lib/db");
  const { items, driveFiles } = await import("../src/lib/db/schema");
  const { and, eq, isNotNull } = await import("drizzle-orm");
  const { removeFile } = await import("../src/lib/storage");
  const { driveLink } = await import("../src/lib/drive/google");

  const rows = await db.select({ id: items.id, path: items.storagePath, status: items.status, size: items.sizeBytes, meta: items.meta, fileId: driveFiles.fileId })
    .from(items).leftJoin(driveFiles, eq(driveFiles.itemId, items.id))
    .where(and(eq(items.source, "drive"), isNotNull(items.storagePath)));

  let kept = 0, removed = 0, bytes = 0;
  for (const r of rows) {
    bytes += Number(r.size ?? 0);
    const keep = r.status === "ready" && r.fileId;
    if (!apply) { keep ? kept++ : removed++; continue; }
    await removeFile(r.path!);
    if (keep) {
      await db.update(items).set({ storagePath: null, meta: { ...((r.meta as object) ?? {}), link: driveLink(r.fileId!) } }).where(eq(items.id, r.id));
      kept++;
    } else {
      if (r.fileId) await db.update(driveFiles).set({ itemId: null, skipped: "נשאר ב-Drive" }).where(eq(driveFiles.fileId, r.fileId));
      await db.delete(items).where(eq(items.id, r.id));
      removed++;
    }
  }
  console.log(`${apply ? "done" : "dry run"}: ${rows.length} copies, ${(bytes / 1e6).toFixed(0)}MB; kept with Drive link ${kept}, removed ${removed}`);
  process.exit(0);
})();
