import { fullYear, israelTime } from "./time";

export type Segment = { speaker: string | null; startMs: number | null; text: string };

const TS = "(\\d{1,2}:\\d{2}(?::\\d{2})?)";
// "[00:01:23] Dana: text"  /  "00:01:23 Dana: text"  /  "Dana (00:01:23): text"
const INLINE = new RegExp(`^\\[?${TS}\\]?\\s*[-–]?\\s*([^:\\n]{1,40}?):\\s+(.+)$`);
const INLINE_AFTER = new RegExp(`^([^:\\n(]{1,40}?)\\s*\\(?${TS}\\)?\\s*:\\s+(.+)$`);
// Speaker heading on its own line: "Dana 00:01:23" / "Dana (00:01:23)" / "00:01:23 Dana" / "Dana - 01:23"
const HEAD = new RegExp(`^([^\\d:\\n][^:\\n]{0,40}?)\\s*[-–]?\\s*\\(?${TS}\\)?$`);
const HEAD_TS_FIRST = new RegExp(`^${TS}\\s+[-–]?\\s*([^:\\n]{1,40})$`);
const PLAIN = /^([^:\n]{2,30}):\s+(.+)$/;

// Header labels that look like "Speaker: text" but are not people.
const HEADER = /^(meeting|title|subject|date|time|attendees|participants|summary|agenda|location|נושא|כותרת|תאריך|שעה|משתתפים|סיכום|פגישה|מיקום|סדר יום)$/i;

const toMs = (ts: string) => {
  const p = ts.split(":").map(Number);
  const [h, m, s] = p.length === 3 ? p : [0, p[0], p[1]];
  return ((h * 60 + m) * 60 + s) * 1000;
};

export function parseTranscript(text: string): Segment[] {
  const out: Segment[] = [];
  let cur: Segment | null = null;
  const push = () => { if (cur && cur.text.trim()) out.push({ ...cur, text: cur.text.trim() }); cur = null; };
  for (const raw of text.replace(/\r/g, "").split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    let m: RegExpMatchArray | null;
    if ((m = line.match(PLAIN)) && HEADER.test(m[1].trim())) { push(); out.push({ speaker: null, startMs: null, text: line }); continue; }
    if ((m = line.match(INLINE))) { push(); out.push({ startMs: toMs(m[1]), speaker: m[2].trim(), text: m[3].trim() }); continue; }
    if ((m = line.match(INLINE_AFTER))) { push(); out.push({ speaker: m[1].trim(), startMs: toMs(m[2]), text: m[3].trim() }); continue; }
    if ((m = line.match(HEAD))) { push(); cur = { speaker: m[1].trim(), startMs: toMs(m[2]), text: "" }; continue; }
    if ((m = line.match(HEAD_TS_FIRST))) { push(); cur = { startMs: toMs(m[1]), speaker: m[2].trim(), text: "" }; continue; }
    if (!cur && (m = line.match(PLAIN))) { out.push({ speaker: m[1].trim(), startMs: null, text: m[2].trim() }); continue; }
    if (cur) cur.text += (cur.text ? " " : "") + line;
    else out.push({ speaker: null, startMs: null, text: line });
  }
  push();
  return out;
}

// A transcript is text where most segments have a speaker, from at least two distinct people.
export function isTranscript(segments: Segment[]) {
  const withSpeaker = segments.filter((s) => s.speaker);
  return withSpeaker.length >= 4 && withSpeaker.length >= segments.length * 0.6 && new Set(withSpeaker.map((s) => s.speaker)).size >= 2;
}

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  ינואר: 1, פברואר: 2, מרץ: 3, אפריל: 4, מאי: 5, יוני: 6, יולי: 7, אוגוסט: 8, ספטמבר: 9, אוקטובר: 10, נובמבר: 11, דצמבר: 12 };

// The meeting date, if the document states one near its top. Otherwise null: the brain does not guess.
export function findDate(text: string): Date | null {
  const head = text.slice(0, 1500);
  let m = head.match(/(20\d{2})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?/);
  if (m) return israelTime(+m[1], +m[2], +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = head.match(/\b(\d{1,2})[./](\d{1,2})[./](\d{2,4})\b(?:,?\s+(\d{1,2}):(\d{2}))?/);
  if (m) return israelTime(fullYear(+m[3]), +m[2], +m[1], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
  m = head.match(/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2}),?\s+(20\d{2})/);
  if (m && MONTHS[m[1].toLowerCase()]) return israelTime(+m[3], MONTHS[m[1].toLowerCase()], +m[2], 12);
  m = head.match(/(\d{1,2})\s+ב?([א-ת]+)\s+(20\d{2})/);
  if (m && MONTHS[m[2]]) return israelTime(+m[3], MONTHS[m[2]], +m[1], 12);
  return null;
}
