import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, clients, items, type Employee } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { putFile } from "@/lib/storage";
import { chunkChat, chunkDocument, chunkTranscript, type NewChunk } from "./chunk";
import { extractText } from "./extract";
import { suggestClient } from "./match";
import { findDate, isTranscript, parseTranscript } from "./transcript";
import { chatNameFromFile, looksLikeWhatsApp, parseWhatsApp } from "./whatsapp";

export const MAX_BYTES = 25 * 1024 * 1024;

export type IngestResult =
  | { ok: true; itemId: string; duplicate?: false }
  | { ok: true; itemId: string; duplicate: true }
  | { ok: false; error: string };

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-90) || "file";

export async function ingestFile(file: { bytes: Uint8Array; name: string; type: string }, by: Employee, clientId?: string | null): Promise<IngestResult> {
  if (file.bytes.byteLength > MAX_BYTES) return { ok: false, error: "הקובץ גדול מ-25MB" };
  if (file.bytes.byteLength === 0) return { ok: false, error: "הקובץ ריק" };

  // Same bytes twice is the same item: point at the existing one instead of storing a copy.
  const contentHash = createHash("sha256").update(file.bytes).digest("hex");
  const [dup] = await db.select({ id: items.id }).from(items).where(eq(items.contentHash, contentHash)).limit(1);
  if (dup) return { ok: true, itemId: dup.id, duplicate: true };

  let chosenClient: string | null = null;
  if (clientId) {
    const [c] = await db.select({ id: clients.id }).from(clients).where(eq(clients.id, clientId)).limit(1);
    chosenClient = c?.id ?? null;
  }

  const id = randomUUID();
  const now = new Date();
  const storagePath = `${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${id}/${safeName(file.name)}`;
  await db.insert(items).values({
    id, kind: "document", source: "upload", title: file.name, fileName: file.name, mimeType: file.type || "application/octet-stream",
    sizeBytes: file.bytes.byteLength, storagePath, contentHash, createdBy: by.id, status: "processing",
  });

  try {
    await putFile(storagePath, file.bytes, file.type || "application/octet-stream");
    const ex = await extractText(file.bytes, file.name);

    if (ex.kind !== "text") {
      const kind = ex.kind === "audio" ? "voice_note" : "document";
      await finish(id, { kind, status: "stored", error: ex.reason }, chosenClient, { text: "", title: file.name, fileName: file.name, participants: [] });
      await audit("item_ingested", by.email, { itemId: id, status: "stored" });
      return { ok: true, itemId: id };
    }

    const text = ex.text;
    let kind: "chat" | "meeting" | "document" = "document";
    let source: "whatsapp" | "timeless" | "upload" = "upload";
    let title = file.name.replace(/\.[^.]+$/, "");
    let occurredAt: Date | null = null;
    let participants: string[] = [];
    let newChunks: NewChunk[] = [];
    const meta: Record<string, unknown> = {};

    if (looksLikeWhatsApp(text)) {
      const chat = parseWhatsApp(text);
      kind = "chat"; source = "whatsapp";
      participants = chat.participants;
      const named = chatNameFromFile(file.name) ?? (ex.innerName ? chatNameFromFile(ex.innerName) : null);
      title = named ? `שיחת וואטסאפ עם ${named}` : `שיחת וואטסאפ: ${participants.slice(0, 3).join(", ")}`;
      const dated = chat.messages.filter((m) => m.at);
      occurredAt = dated[0]?.at ?? null;
      meta.messages = chat.messages.length;
      meta.lastAt = dated[dated.length - 1]?.at ?? null;
      if (ex.mediaCount) meta.mediaFiles = ex.mediaCount;
      newChunks = chunkChat(chat.messages);
    } else {
      const segments = parseTranscript(text);
      if (isTranscript(segments)) {
        kind = "meeting";
        source = /timeless/i.test(file.name + text.slice(0, 2000)) ? "timeless" : "upload";
        participants = [...new Set(segments.map((s) => s.speaker).filter((s): s is string => !!s))];
        meta.segments = segments.length;
        newChunks = chunkTranscript(segments);
      } else {
        newChunks = chunkDocument(text);
      }
      occurredAt = findDate(text);
    }

    if (newChunks.length) {
      await db.insert(chunks).values(newChunks.map((c, seq) => ({ itemId: id, seq, text: c.text, speaker: c.speaker, startMs: c.startMs, at: c.at })));
    }
    await finish(id, { kind, source, title, occurredAt, participants, status: newChunks.length ? "ready" : "failed", error: newChunks.length ? null : "לא נמצא טקסט בקובץ", meta: { ...meta, chunks: newChunks.length } },
      chosenClient, { text, title, fileName: file.name, participants });
    await audit("item_ingested", by.email, { itemId: id, kind, chunks: newChunks.length });
    return { ok: true, itemId: id };
  } catch (e) {
    console.error("ingest failed", id, e);
    await db.update(items).set({ status: "failed", error: "משהו נכשל בעיבוד הקובץ. אפשר לנסות שוב" }).where(eq(items.id, id));
    return { ok: true, itemId: id };
  }
}

async function finish(
  id: string,
  patch: Partial<typeof items.$inferInsert>,
  chosenClient: string | null,
  forMatch: { text: string; title: string; fileName: string; participants: string[] },
) {
  let assignment: Partial<typeof items.$inferInsert> = { clientId: null, assignment: "none", assignmentReason: null };
  if (chosenClient) assignment = { clientId: chosenClient, assignment: "confirmed", assignmentReason: "הועלה מתוך מרחב הלקוח" };
  else {
    const s = await suggestClient(forMatch);
    if (s) assignment = { clientId: s.clientId, assignment: "suggested", assignmentReason: s.reason };
  }
  await db.update(items).set({ ...patch, ...assignment }).where(and(eq(items.id, id)));
}
