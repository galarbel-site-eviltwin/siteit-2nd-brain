import { loadEnvConfig } from "@next/env";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
loadEnvConfig(process.cwd());

// A full copy of the brain on this computer: every table as JSON, plus the files uploaded to Storage.
// The free Supabase plan keeps no downloadable backups, so this is the backup.
// Usage: npx tsx scripts/backup.ts [folder]   (default: C:\dev\siteit-2nd-brain-backups)
// Tokens stay encrypted as they are in the database; restoring them needs the same TOKEN_KEY.
(async () => {
  const schema = await import("../src/lib/db/schema");
  const { db } = await import("../src/lib/db");
  const { getFile } = await import("../src/lib/storage");
  const { isNotNull } = await import("drizzle-orm");

  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
  const root = join(process.argv[2] ?? "C:\\dev\\siteit-2nd-brain-backups", stamp);
  mkdirSync(root, { recursive: true });

  const tables = {
    employees: schema.employees, audit_log: schema.auditLog, clients: schema.clients, client_aliases: schema.clientAliases, contacts: schema.contacts,
    items: schema.items, chunks: schema.chunks, connections: schema.connections, drive_folders: schema.driveFolders, drive_files: schema.driveFiles,
    accounts: schema.accounts, mail_threads: schema.mailThreads, events: schema.events,
  };
  const manifest: Record<string, number> = {};
  for (const [name, table] of Object.entries(tables)) {
    const rows = await db.select().from(table as never);
    // Vectors can be rebuilt from the text; leaving them out keeps the backup small.
    const clean = name === "chunks" ? (rows as Record<string, unknown>[]).map(({ embedding: _e, ...r }) => r) : rows;
    writeFileSync(join(root, `${name}.json`), JSON.stringify(clean, null, 1));
    manifest[name] = rows.length;
  }

  let files = 0;
  for (const it of await db.select({ path: schema.items.storagePath }).from(schema.items).where(isNotNull(schema.items.storagePath))) {
    try {
      const out = join(root, "files", it.path!);
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, await getFile(it.path!));
      files++;
    } catch (e) {
      console.error("file skipped", it.path, (e as Error).message);
    }
  }
  writeFileSync(join(root, "manifest.json"), JSON.stringify({ at: new Date().toISOString(), tables: manifest, files }, null, 1));
  console.log(`backup saved to ${root}`);
  console.log(Object.entries(manifest).map(([k, v]) => `${k}: ${v}`).join(", "), `| files: ${files}`);
  process.exit(0);
})();
