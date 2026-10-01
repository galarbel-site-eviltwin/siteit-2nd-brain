import { fullYear, israelTime } from "./time";
import { MONTHS } from "./transcript";

export type ChatMessage = { at: Date | null; sender: string | null; text: string; media: boolean };

// Android: "30/09/2026, 14:05 - נגה: text"   iOS: "[30.9.2026, 14:05:12] נגה: text"
// Both may carry 12-hour times and invisible direction marks, depending on the phone's language.
const ANDROID = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\s+[-–]\s+([\s\S]*)$/;
const IOS = /^\[(\d{1,2})[./-](\d{1,2})[./-](\d{2,4}),?\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp]\.?\s?[Mm]\.?)?\]\s+([\s\S]*)$/;
const MEDIA = /(<media omitted>|<המדיה לא נכללה>|image omitted|video omitted|audio omitted|sticker omitted|document omitted|\(file attached\)|\(קובץ מצורף\)|‏?<מצורף:)/i;

const clean = (s: string) => s.replace(/[‎‏‪-‮⁦-⁩﻿]/g, "").replace(/ | /g, " ");

type Raw = { a: number; b: number; y: number; h: number; mi: number; s: number; ampm?: string; rest: string };

function matchLine(line: string): Raw | null {
  const m = line.match(IOS) ?? line.match(ANDROID);
  if (!m) return null;
  return { a: +m[1], b: +m[2], y: fullYear(+m[3]), h: +m[4], mi: +m[5], s: m[6] ? +m[6] : 0, ampm: m[7], rest: m[8] };
}

export function looksLikeWhatsApp(text: string) {
  if (looksLikeWhatsAppMarkdown(text)) return true;
  let hits = 0;
  for (const line of clean(text).split(/\r?\n/).slice(0, 60)) if (matchLine(line.trim())) hits++;
  return hits >= 3;
}

export function parseWhatsApp(text: string) {
  if (looksLikeWhatsAppMarkdown(text)) return parseMarkdown(text);
  const raws: (Raw & { more: string[] })[] = [];
  for (const rawLine of clean(text).split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const r = matchLine(line.trim());
    if (r) raws.push({ ...r, more: [] });
    else if (raws.length && line.trim()) raws[raws.length - 1].more.push(line.trim());
  }
  // Day-first unless the file proves otherwise (Israeli phones export day-first).
  const monthFirst = !raws.some((r) => r.a > 12) && raws.some((r) => r.b > 12);

  const messages: ChatMessage[] = raws.map((r) => {
    let h = r.h;
    if (r.ampm) {
      const pm = /p/i.test(r.ampm);
      if (pm && h < 12) h += 12;
      if (!pm && h === 12) h = 0;
    }
    const [d, mo] = monthFirst ? [r.b, r.a] : [r.a, r.b];
    const body = [r.rest, ...r.more].join("\n");
    const colon = body.indexOf(": ");
    const hasSender = colon > 0 && colon < 60 && !body.slice(0, colon).includes("\n");
    const textPart = hasSender ? body.slice(colon + 2) : body;
    return { at: israelTime(r.y, mo, d, h, r.mi, r.s), sender: hasSender ? body.slice(0, colon).trim() : null, text: textPart.trim(), media: MEDIA.test(textPart) };
  });

  // WhatsApp's own notices (encryption banner, disappearing-message settings) are not conversation.
  const NOTICE = /(end-to-end encrypted|מוצפנות מקצה לקצה|messages and calls are|הודעות זמניות|disappearing messages)/i;
  const kept = messages.filter((m) => m.sender || !NOTICE.test(m.text));
  const participants = [...new Set(kept.map((m) => m.sender).filter((s): s is string => !!s))];
  return { messages: kept, participants };
}

// "WhatsApp Chat with Noga.txt", "צ'אט WhatsApp עם נגה.txt", "WhatsApp Chat - Noga.zip"
export function chatNameFromFile(fileName: string) {
  const base = fileName.replace(/\.(txt|zip|md)$/i, "");
  const m = base.match(/(?:whatsapp chat (?:with|-)|צ.?אט whatsapp עם|שיחת whatsapp עם)\s*(.+)$/i);
  return m ? m[1].trim() : null;
}

// ---------- Markdown exports (browser extensions) ----------
// "# WhatsApp Chat Export: Noga"  /  "## 30 ביולי 2026"  /  "[13:20] **Noga:** text"
const MD_HEAD = /^#\s*WhatsApp Chat Export:\s*(.+)$/im;
const MD_DAY = /^##\s+(.+)$/;
const MD_MSG = /^\[(\d{1,2}):(\d{2})(?::(\d{2}))?\]\s+\*\*(.+?):?\*\*:?\s*([\s\S]*)$/;

function mdDay(s: string): [number, number, number] | null {
  const t = clean(s).trim().toLowerCase();
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) return [fullYear(+m[3]), +m[2], +m[1]];
  m = t.match(/(\d{1,2})\s+ב?([a-zא-ת]+),?\s+(\d{4})/);
  if (m && MONTHS[m[2]]) return [+m[3], MONTHS[m[2]], +m[1]];
  m = t.match(/([a-z]+)\s+(\d{1,2}),?\s+(\d{4})/);
  if (m && MONTHS[m[1]]) return [+m[3], MONTHS[m[1]], +m[2]];
  return null;
}

export const looksLikeWhatsAppMarkdown = (text: string) =>
  MD_HEAD.test(text.slice(0, 500)) || clean(text).split(/\r?\n/).slice(0, 80).filter((l) => MD_MSG.test(l.trim())).length >= 3;

export function chatNameFromMarkdown(text: string) {
  return text.slice(0, 500).match(MD_HEAD)?.[1].trim() ?? null;
}

function parseMarkdown(text: string) {
  const messages: ChatMessage[] = [];
  let day: [number, number, number] | null = null;
  for (const rawLine of clean(text).split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^#\s/.test(line) || /^export date:/i.test(line) || /^-{3,}$/.test(line)) continue;
    const d = line.match(MD_DAY);
    if (d) { day = mdDay(d[1]) ?? day; continue; }
    const m = line.match(MD_MSG);
    if (m) {
      const at = day ? israelTime(day[0], day[1], day[2], +m[1], +m[2], m[3] ? +m[3] : 0) : null;
      messages.push({ at, sender: m[4].trim(), text: m[5].trim(), media: MEDIA.test(m[5]) });
    } else if (messages.length) {
      // Continuation lines and quoted replies ("> _Noga: text_") belong to the message above.
      const prev = messages[messages.length - 1];
      const quoted = line.match(/^>\s*_?(.*?)_?$/);
      prev.text = [prev.text, quoted ? `(בתגובה ל: ${quoted[1]})` : line].filter(Boolean).join("\n");
    }
  }
  const participants = [...new Set(messages.map((m) => m.sender).filter((s): s is string => !!s))];
  return { messages, participants };
}
