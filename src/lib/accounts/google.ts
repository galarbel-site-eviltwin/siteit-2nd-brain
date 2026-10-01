import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";
import { redirectUri, tokenRequest } from "@/lib/drive/google";

// Read-only. The brain never sends mail or changes the calendar.
export const MAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
export const CAL_SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

// Same redirect address as the Drive grant (already registered in Google Cloud); the state cookie says which flow it is.
export function mailAuthUrl(origin: string, state: string, email: string) {
  const p = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!, redirect_uri: redirectUri(origin), response_type: "code", scope: `openid email ${MAIL_SCOPE} ${CAL_SCOPE}`,
    access_type: "offline", prompt: "consent", include_granted_scopes: "true", state, hd: "eviltwin.io", login_hint: email,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

export async function saveGoogleAccount(employeeId: string, email: string, refreshToken: string, scopes: string) {
  const tokenEnc = encrypt(refreshToken);
  await db.insert(accounts).values({ employeeId, provider: "google", email, tokenEnc, scopes, mailState: {} })
    .onConflictDoUpdate({ target: [accounts.employeeId, accounts.provider], set: { email, tokenEnc, scopes, lastError: null } });
}

export async function googleAccountFor(employeeId: string) {
  const [a] = await db.select().from(accounts).where(and(eq(accounts.employeeId, employeeId), eq(accounts.provider, "google"))).limit(1);
  return a ?? null;
}

export async function googleToken(acc: { tokenEnc: string }) {
  return (await tokenRequest({ refresh_token: decrypt(acc.tokenEnc), grant_type: "refresh_token" })).access_token;
}

async function get<T>(token: string, url: string, params: Record<string, string> = {}): Promise<T> {
  const res = await fetch(`${url}?${new URLSearchParams(params)}`, { headers: { authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

// ---------- Gmail ----------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";
type Part = { mimeType: string; filename?: string; headers?: { name: string; value: string }[]; body?: { data?: string; size?: number }; parts?: Part[] };
export type GmailMessage = { id: string; threadId: string; internalDate: string; payload: Part; labelIds?: string[] };

export const listThreads = (token: string, q: string, pageToken?: string | null) =>
  get<{ threads?: { id: string }[]; nextPageToken?: string }>(token, `${GMAIL}/threads`, { q, maxResults: "50", ...(pageToken ? { pageToken } : {}) });

export const getThread = (token: string, id: string) => get<{ id: string; messages: GmailMessage[] }>(token, `${GMAIL}/threads/${id}`, { format: "full" });

const b64 = (s: string) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
export const header = (m: GmailMessage, name: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function findPart(p: Part, type: string): Part | null {
  if (p.mimeType === type && p.body?.data) return p;
  for (const c of p.parts ?? []) { const f = findPart(c, type); if (f) return f; }
  return null;
}

const stripHtml = (h: string) => h.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "").replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n").replace(/<[^>]+>/g, "")
  .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

// The new text of a message: plain text when there is one, without the quoted thread below it.
export function messageText(m: GmailMessage) {
  const plain = findPart(m.payload, "text/plain");
  const html = plain ? null : findPart(m.payload, "text/html");
  let t = plain ? b64(plain.body!.data!) : html ? stripHtml(b64(html.body!.data!)) : "";
  const cut = t.search(/^(On .{5,200}wrote:|בתאריך .{5,200}(כתב|נכתב|מאת).{0,40}:?|-{2,} ?Original Message ?-{2,}|-{2,} ?Forwarded message ?-{2,}|From: .+\r?\nSent: )/im);
  if (cut > 0) t = t.slice(0, cut);
  return t.split(/\r?\n/).filter((l) => !/^\s*>/.test(l)).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const attachments = (m: GmailMessage) => {
  const out: string[] = [];
  const walk = (p: Part) => { if (p.filename) out.push(p.filename); (p.parts ?? []).forEach(walk); };
  walk(m.payload);
  return out;
};

// ---------- Calendar ----------

export type GEvent = {
  id: string; status: string; summary?: string; location?: string; hangoutLink?: string; htmlLink?: string;
  start: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  attendees?: { email: string; displayName?: string; self?: boolean; resource?: boolean }[];
  conferenceData?: { entryPoints?: { uri: string; entryPointType: string }[] };
};

export async function listEvents(token: string, from: Date, to: Date) {
  const out: GEvent[] = [];
  let pageToken: string | undefined;
  do {
    const r = await get<{ items: GEvent[]; nextPageToken?: string }>(token, "https://www.googleapis.com/calendar/v3/calendars/primary/events", {
      timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250", ...(pageToken ? { pageToken } : {}),
    });
    out.push(...r.items);
    pageToken = r.nextPageToken;
  } while (pageToken && out.length < 2000);
  return out;
}
