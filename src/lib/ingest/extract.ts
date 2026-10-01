import { unzipSync } from "fflate";

export type Extracted =
  | { kind: "text"; text: string; innerName?: string; mediaCount?: number }
  | { kind: "audio" | "image" | "unsupported"; reason: string };

const ext = (name: string) => name.toLowerCase().split(".").pop() ?? "";
const decode = (u8: Uint8Array) => new TextDecoder("utf-8").decode(u8).replace(/^﻿/, "");

const AUDIO = ["m4a", "mp3", "wav", "ogg", "opus", "aac", "webm", "mp4", "mov"];
const IMAGE = ["png", "jpg", "jpeg", "webp", "heic", "gif"];
const TEXT = ["txt", "md", "csv", "vtt", "srt", "json"];

export async function extractText(buf: Uint8Array, name: string): Promise<Extracted> {
  const e = ext(name);
  if (TEXT.includes(e)) return { kind: "text", text: decode(buf) };

  if (e === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
    return { kind: "text", text: value };
  }

  if (e === "pdf") {
    const { extractText: pdfText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(buf));
    const { text } = await pdfText(pdf, { mergePages: true });
    return { kind: "text", text: Array.isArray(text) ? text.join("\n\n") : text };
  }

  if (e === "zip") {
    // A WhatsApp export "with media": one chat .txt plus attachments.
    const files = unzipSync(buf);
    const names = Object.keys(files);
    const chat = names.find((n) => /(^|\/)_chat\.txt$/i.test(n)) ?? names.find((n) => /\.txt$/i.test(n));
    if (!chat) return { kind: "unsupported", reason: "בקובץ ה-zip לא נמצא קובץ טקסט של שיחה" };
    return { kind: "text", text: decode(files[chat]), innerName: chat, mediaCount: names.length - 1 };
  }

  if (AUDIO.includes(e)) return { kind: "audio", reason: "הקובץ נשמר. תמלול הקלטות יתווסף בהמשך, ועד אז התוכן שלה לא זמין לחיפוש" };
  if (IMAGE.includes(e)) return { kind: "image", reason: "התמונה נשמרה. קריאת טקסט מתמונות וצילומי מסך תתווסף בהמשך" };
  if (e === "doc" || e === "pptx" || e === "xlsx")
    return { kind: "unsupported", reason: `קבצי .${e} עוד לא נקראים. אפשר לשמור כ-PDF או DOCX ולהעלות שוב` };
  return { kind: "unsupported", reason: "סוג הקובץ הזה עוד לא נתמך" };
}
