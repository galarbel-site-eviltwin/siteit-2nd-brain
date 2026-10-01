import type { ChatMessage } from "./whatsapp";
import type { Segment } from "./transcript";

export type NewChunk = { text: string; speaker: string | null; startMs: number | null; at: Date | null };

const LIMIT = 1400;
const hhmm = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" });

// Chats: one chunk never spans two days, so a citation can name the day it points to.
export function chunkChat(messages: ChatMessage[]): NewChunk[] {
  const out: NewChunk[] = [];
  let buf: string[] = [], size = 0, first: Date | null = null, curDay = "";
  const flush = () => { if (buf.length) out.push({ text: buf.join("\n"), speaker: null, startMs: null, at: first }); buf = []; size = 0; first = null; };
  for (const m of messages) {
    const d = m.at ? day.format(m.at) : curDay;
    if (d !== curDay || size > LIMIT) flush();
    curDay = d;
    const line = `${m.at ? hhmm.format(m.at) + " " : ""}${m.sender ? m.sender + ": " : ""}${m.media ? "[מדיה]" : m.text}`;
    if (!first) first = m.at;
    buf.push(line);
    size += line.length;
  }
  flush();
  return out;
}

// Transcripts: consecutive turns are grouped, but a chunk starts at a speaker turn so its time stamp is real.
export function chunkTranscript(segments: Segment[]): NewChunk[] {
  const out: NewChunk[] = [];
  let buf: string[] = [], size = 0, start: number | null = null, speakers = new Set<string>();
  const flush = () => {
    if (buf.length) out.push({ text: buf.join("\n"), speaker: speakers.size === 1 ? [...speakers][0] : null, startMs: start, at: null });
    buf = []; size = 0; start = null; speakers = new Set();
  };
  for (const s of segments) {
    if (size > LIMIT) flush();
    if (start === null) start = s.startMs;
    if (s.speaker) speakers.add(s.speaker);
    const line = s.speaker ? `${s.speaker}: ${s.text}` : s.text;
    buf.push(line);
    size += line.length;
  }
  flush();
  return out;
}

export function chunkDocument(text: string): NewChunk[] {
  const paras = text.replace(/\r/g, "").split(/\n\s*\n/).map((p) => p.replace(/[ \t]+/g, " ").trim()).filter(Boolean);
  const out: NewChunk[] = [];
  let buf: string[] = [], size = 0;
  for (const p of paras) {
    if (size + p.length > LIMIT && buf.length) { out.push({ text: buf.join("\n\n"), speaker: null, startMs: null, at: null }); buf = []; size = 0; }
    // A single giant paragraph (common in PDFs) is cut on sentence ends.
    if (p.length > LIMIT * 1.5) {
      for (const piece of p.match(new RegExp(`[\\s\\S]{1,${LIMIT}}(?:[.!?](?=\\s)|$)`, "g")) ?? [p]) out.push({ text: piece.trim(), speaker: null, startMs: null, at: null });
      continue;
    }
    buf.push(p);
    size += p.length;
  }
  if (buf.length) out.push({ text: buf.join("\n\n"), speaker: null, startMs: null, at: null });
  return out;
}
