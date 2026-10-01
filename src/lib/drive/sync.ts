import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientAliases, clients, connections, driveFiles, driveFolders, employees, items } from "@/lib/db/schema";
import { normName } from "@/lib/ingest/match";
import { ingestFile, MAX_BYTES } from "@/lib/ingest/pipeline";
import { deleteItem } from "@/lib/items";
import { accessToken, download, FOLDER, getConnection, getRoots, isSyncable, listChildren, type DriveConfig, type DriveFile } from "./google";

export type SyncResult = { ok: true; added: number; updated: number; failed: number; newFolders: number; more: boolean } | { ok: false; reason: string };

const REASON = "מתיקיית הלקוח ב-Google Drive";

// Files under a client folder, including its subfolders (a few levels deep is plenty).
async function walk(token: string, folderId: string, driveId: string | undefined, depth = 0): Promise<DriveFile[]> {
  const kids = await listChildren(token, folderId, driveId);
  const files = kids.filter((k) => k.mimeType !== FOLDER);
  if (depth < 4) for (const sub of kids.filter((k) => k.mimeType === FOLDER)) files.push(...(await walk(token, sub.id, driveId, depth + 1)));
  return files;
}

// A new folder named like a known client gets that client as a suggestion; a person still decides.
async function suggestFor(name: string) {
  const n = normName(name);
  const [byAlias] = await db.select({ id: clientAliases.clientId }).from(clientAliases)
    .where(and(eq(clientAliases.value, n), or(eq(clientAliases.kind, "name"), eq(clientAliases.kind, "nickname")))).limit(1);
  if (byAlias) return byAlias.id;
  const all = await db.select({ id: clients.id, name: clients.name }).from(clients);
  return all.find((c) => { const cn = normName(c.name); return cn.length >= 3 && (n.includes(cn) || cn.includes(n)); })?.id ?? null;
}

export async function syncDrive({ budgetMs = 240_000, maxFiles = 40 } = {}): Promise<SyncResult> {
  const conn = await getConnection();
  if (!conn?.tokenEnc) return { ok: false, reason: "not_connected" };
  const roots = getRoots(conn.config as DriveConfig);
  if (!roots.length) return { ok: false, reason: "no_root" };

  const [lease] = await db.update(connections).set({ lockedUntil: sql`now() + interval '5 minutes'`, lastSyncAt: new Date() })
    .where(and(eq(connections.id, conn.id), or(isNull(connections.lockedUntil), lt(connections.lockedUntil, sql`now()`)))).returning({ id: connections.id });
  if (!lease) return { ok: false, reason: "busy" };

  const started = Date.now();
  let added = 0, updated = 0, failed = 0, newFolders = 0, more = false;
  try {
    const [owner] = conn.ownerId ? await db.select().from(employees).where(eq(employees.id, conn.ownerId)).limit(1) : [];
    if (!owner?.active) throw new Error("מי שחיבר את ה-Drive כבר לא פעיל. צריך לחבר מחדש");
    const token = await accessToken();

    // 1. Client folders directly under each root.
    const known = new Map((await db.select().from(driveFolders)).map((f) => [f.folderId, f]));
    const folders: (DriveFile & { driveId?: string })[] = [];
    for (const root of roots) {
      for (const f of await listChildren(token, root.id, root.driveId, true)) {
        folders.push({ ...f, driveId: root.driveId });
        const k = known.get(f.id);
        if (!k) {
          await db.insert(driveFolders).values({ folderId: f.id, name: f.name, rootId: root.id, status: "pending", suggestedClientId: await suggestFor(f.name) });
          newFolders++;
        } else if (k.name !== f.name || k.rootId !== root.id) await db.update(driveFolders).set({ name: f.name, rootId: root.id }).where(eq(driveFolders.folderId, f.id));
      }
    }

    // 2. Files in folders a person has linked to a client.
    const mapped = (await db.select().from(driveFolders).where(eq(driveFolders.status, "mapped"))).filter((f) => f.clientId && folders.some((x) => x.id === f.folderId));
    outer: for (const fo of mapped) {
      const seen = new Map((await db.select().from(driveFiles).where(eq(driveFiles.folderId, fo.folderId))).map((s) => [s.fileId, s]));
      for (const f of await walk(token, fo.folderId, folders.find((x) => x.id === fo.folderId)?.driveId)) {
        if (!isSyncable(f)) continue;
        const version = f.version ?? f.modifiedTime;
        const prev = seen.get(f.id);
        if (prev && prev.version === version) continue;
        if (Date.now() - started > budgetMs || added + updated + failed >= maxFiles) { more = true; break outer; }
        const record = (v: Partial<typeof driveFiles.$inferInsert>) =>
          db.insert(driveFiles).values({ fileId: f.id, folderId: fo.folderId, name: f.name, ...v }).onConflictDoUpdate({ target: driveFiles.fileId, set: { name: f.name, syncedAt: new Date(), ...v } });
        if (Number(f.size ?? 0) > MAX_BYTES) { await record({ version, itemId: null, skipped: "גדול מ-25MB" }); continue; }
        try {
          const file = await download(token, f);
          // An edited file replaces its earlier version, but never an item someone uploaded by hand.
          if (prev?.itemId) {
            const [old] = await db.select({ source: items.source }).from(items).where(eq(items.id, prev.itemId)).limit(1);
            if (old?.source === "drive") await deleteItem(prev.itemId);
          }
          const r = await ingestFile(file, owner, fo.clientId, { source: "drive", reason: REASON, fallbackDate: new Date(f.createdTime) });
          await record({ version, itemId: r.ok ? r.itemId : null, skipped: r.ok ? null : r.error });
          if (prev) updated++; else added++;
        } catch (e) {
          console.error("drive file failed", f.id, e);
          await record({ version: null, skipped: "נכשל, ינוסה שוב בסנכרון הבא" });
          failed++;
        }
      }
    }

    const result = { added, updated, failed, newFolders, more };
    await db.update(connections).set({ lastSuccessAt: new Date(), lastError: null, lastResult: result, lockedUntil: null }).where(eq(connections.id, conn.id));
    return { ok: true, ...result };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    await db.update(connections).set({ lastError: reason, lockedUntil: null }).where(eq(connections.id, conn.id));
    return { ok: false, reason };
  }
}
