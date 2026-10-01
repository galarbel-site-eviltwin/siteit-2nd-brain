import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, driveFiles, employees, items } from "@/lib/db/schema";
import { accessToken, download, getFolder } from "@/lib/drive/google";
import { getFile } from "@/lib/storage";
import { extractText } from "./extract";
import { analyze } from "./pipeline";

// Reads an item again with the current rules (better parsers, new sources) and replaces its pieces.
// The client assignment stays, and so does a title someone changed by hand.
export async function reanalyzeItem(itemId: string) {
  const [it] = await db.select().from(items).where(eq(items.id, itemId)).limit(1);
  if (!it || !it.fileName) return { ok: false as const, reason: "missing" };

  let bytes: Uint8Array, name = it.fileName;
  if (it.storagePath) bytes = await getFile(it.storagePath);
  else {
    const [df] = await db.select({ fileId: driveFiles.fileId }).from(driveFiles).where(eq(driveFiles.itemId, itemId)).limit(1);
    if (!df) return { ok: false as const, reason: "no_source" };
    const token = await accessToken();
    const meta = await getFolder(token, df.fileId);
    const file = await download(token, { ...meta, modifiedTime: "", createdTime: "" });
    bytes = file.bytes; name = file.name;
  }

  const ex = await extractText(bytes, name);
  if (ex.kind !== "text") return { ok: false as const, reason: ex.kind };
  const [by] = it.createdBy ? await db.select().from(employees).where(eq(employees.id, it.createdBy)).limit(1) : [];
  if (!by) return { ok: false as const, reason: "no_uploader" };
  const a = analyze(ex, name, by, { source: it.source === "drive" || (it.meta as { link?: string } | null)?.link ? "drive" : undefined, fallbackDate: it.occurredAt });

  const autoTitle = it.title === it.fileName || it.title === it.fileName.replace(/\.[^.]+$/, "") || /^(שיחת וואטסאפ|פגישה|פגישת Zoom)/.test(it.title);
  const keep = (it.meta ?? {}) as Record<string, unknown>;
  await db.transaction(async (tx) => {
    await tx.delete(chunks).where(eq(chunks.itemId, itemId));
    if (a.chunks.length) await tx.insert(chunks).values(a.chunks.map((c, seq) => ({ itemId, seq, text: c.text, speaker: c.speaker, startMs: c.startMs, at: c.at })));
    await tx.update(items).set({
      kind: a.kind, source: a.source, participants: a.participants, occurredAt: a.occurredAt ?? it.occurredAt,
      title: autoTitle ? a.title : it.title, status: a.chunks.length ? "ready" : "failed",
      meta: { ...(keep.link ? { link: keep.link } : {}), ...a.meta, chunks: a.chunks.length },
    }).where(eq(items.id, itemId));
  });
  return { ok: true as const, kind: a.kind, source: a.source, title: autoTitle ? a.title : it.title };
}
