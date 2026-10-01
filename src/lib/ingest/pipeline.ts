import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chunks, clients, items, type Employee } from "@/lib/db/schema";
import { audit } from "@/lib/employees";
import { putFile } from "@/lib/storage";
import { chunkChat, chunkDocument, chunkTranscript, type NewChunk } from "./chunk";
import { extractText } from "./extract";
import { suggestClient } from "./match";
import { findDate, isSubtitles, isTranscript, parseTranscript } from "./transcript";
import { chatNameFromFile, chatNameFromMarkdown, looksLikeWhatsApp, parseWhatsApp } from "./whatsapp";

export const MAX_BYTES = 25 * 1024 * 1024;

export type IngestResult =
  | { ok: true; itemId: string; duplicate?: false }
  | { ok: true; itemId: string; duplicate: true }
  | { ok: false; error: string };

const safeName = (n: string) => n.normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(-90) || "file";

// Optional context from a connected source (Drive): who it is, which client folder it came from, a fallback date.
// externalLink: the file lives in a connected source (Drive); keep a link to it instead of a copy.
export type IngestContext = { source?: "drive"; reason?: string; fallbackDate?: Date | null; externalLink?: string };

export async function ingestFile(file: { bytes: Uint8Array; name: string; type: string }, by: Employee, clientId?: string | null, ctx: IngestContext = {}): Promise<IngestResult> {
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
    id, kind: "document", source: ctx.source ?? "upload", title: file.name, fileName: file.name, mimeType: file.type || "application/octet-stream",
    sizeBytes: file.bytes.byteLength, storagePath: ctx.externalLink ? null : storagePath, contentHash, createdBy: by.id, status: "processing",
    meta: ctx.externalLink ? { link: ctx.externalLink } : null,
  });

  try {
    if (!ctx.externalLink) await putFile(storagePath, file.bytes, file.type || "application/octet-stream");
    const ex = await extractText(file.bytes, file.name);

    if (ex.kind !== "text") {
      const kind = ex.kind === "audio" ? "voice_note" : "document";
      const source = ex.kind === "audio" && ZOOM_NAME.test(file.name) ? "zoom" : ctx.source ?? "upload";
      await finish(id, { kind, source, status: "stored", error: ex.reason, occurredAt: ctx.fallbackDate ?? null }, chosenClient, { text: "", title: file.name, fileName: file.name, participants: [] }, ctx.reason);
      await audit("item_ingested", by.email, { itemId: id, status: "stored" });
      return { ok: true, itemId: id };
    }

    const { kind, source, title, occurredAt, participants, chunks: newChunks, meta } = analyze(ex, file.name, by, ctx);
    if (newChunks.length) {
      await db.insert(chunks).values(newChunks.map((c, seq) => ({ itemId: id, seq, text: c.text, speaker: c.speaker, startMs: c.startMs, at: c.at })));
    }
    await finish(id, { kind, source, title, occurredAt, participants, status: newChunks.length ? "ready" : "failed", error: newChunks.length ? null : "לא נמצא טקסט בקובץ", meta: { ...meta, chunks: newChunks.length, ...(ctx.externalLink ? { link: ctx.externalLink } : {}) } },
      chosenClient, { text: ex.text, title, fileName: file.name, participants }, ctx.reason);
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
  reason?: string,
) {
  let assignment: Partial<typeof items.$inferInsert> = { clientId: null, assignment: "none", assignmentReason: null };
  if (chosenClient) assignment = { clientId: chosenClient, assignment: "confirmed", assignmentReason: reason ?? "הועלה מתוך מרחב הלקוח" };
  else {
    const s = await suggestClient(forMatch);
    if (s) assignment = { clientId: s.clientId, assignment: "suggested", assignmentReason: s.reason };
  }
  await db.update(items).set({ ...patch, ...assignment }).where(and(eq(items.id, id)));
}

// Zoom names its files "GMT20261001-101500_Recording..." and "...transcript.vtt"; people often keep "zoom" in the name.
const ZOOM_NAME = /zoom|^GMT\d{8}-\d{6}/i;

type Analysis = {
  kind: "chat" | "meeting" | "document"; source: "whatsapp" | "timeless" | "zoom" | "upload" | "drive";
  title: string; occurredAt: Date | null; participants: string[]; chunks: NewChunk[]; meta: Record<string, unknown>;
};

// What a text is (a WhatsApp chat, a Timeless or Zoom transcript, or a document), and its pieces.
export function analyze(ex: { text: string; innerName?: string; mediaCount?: number }, fileName: string, by: Employee, ctx: IngestContext = {}): Analysis {
  const text = ex.text;
  const meta: Record<string, unknown> = {};
  const base = fileName.replace(/\.[^.]+$/, "");

  if (looksLikeWhatsApp(text)) {
    const chat = parseWhatsApp(text);
    // "You" in an export is whoever exported it, which is the person uploading it.
    for (const m of chat.messages) if (m.sender && /^(you|את\/ה|אתה|את)$/i.test(m.sender)) m.sender = by.name;
    const participants = [...new Set(chat.messages.map((m) => m.sender).filter((x): x is string => !!x))];
    const named = chatNameFromMarkdown(text) ?? chatNameFromFile(fileName) ?? (ex.innerName ? chatNameFromFile(ex.innerName) : null);
    const others = participants.filter((p) => p !== by.name);
    const dated = chat.messages.filter((m) => m.at);
    meta.messages = chat.messages.length;
    meta.lastAt = dated[dated.length - 1]?.at ?? null;
    if (ex.mediaCount) meta.mediaFiles = ex.mediaCount;
    return {
      kind: "chat", source: "whatsapp", participants, meta, chunks: chunkChat(chat.messages), occurredAt: dated[0]?.at ?? null,
      title: named ? `שיחת וואטסאפ עם ${named}` : `שיחת וואטסאפ עם ${(others.length ? others : participants).slice(0, 3).join(", ")}`,
    };
  }

  const segments = parseTranscript(text);
  const occurredAt = findDate(text) ?? ctx.fallbackDate ?? null;
  if (isTranscript(segments)) {
    const head = fileName + " " + text.slice(0, 2000);
    // Zoom is the only tool here that saves transcripts as WebVTT.
    const source = /timeless/i.test(head) ? "timeless" : ZOOM_NAME.test(fileName) || /zoom/i.test(head) || (isSubtitles(text) && /^WEBVTT/.test(text.trimStart())) ? "zoom" : ctx.source ?? "upload";
    const participants = [...new Set(segments.map((x) => x.speaker).filter((x): x is string => !!x))];
    meta.segments = segments.length;
    const label = source === "timeless" ? "פגישה מ-Timeless" : source === "zoom" ? "פגישת Zoom" : "פגישה";
    const generic = /^(transcript|meeting|recording|gmt\d|zoom|timeless|תמלול|פגישה)/i.test(base);
    return { kind: "meeting", source, participants, meta, chunks: chunkTranscript(segments), occurredAt, title: generic ? `${label} עם ${participants.slice(0, 3).join(", ")}` : base };
  }
  return { kind: "document", source: ctx.source ?? "upload", participants: [], meta, chunks: chunkDocument(text), occurredAt, title: base };
}
