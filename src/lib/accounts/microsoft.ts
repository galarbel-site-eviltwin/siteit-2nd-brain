import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/crypto";

// Outlook and the Microsoft calendar through Microsoft Graph, read-only. Needs an app registered in the
// company's Microsoft account: MS_CLIENT_ID, MS_CLIENT_SECRET and MS_TENANT_ID (or "organizations").
export const MS_SCOPES = "offline_access openid email User.Read Mail.Read Calendars.Read";
export const msConfigured = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
const tenant = () => process.env.MS_TENANT_ID || "organizations";
export const msRedirectUri = (origin: string) => `${origin}/api/connect/microsoft/callback`;
const GRAPH = "https://graph.microsoft.com/v1.0";

export function msAuthUrl(origin: string, state: string, email: string) {
  const p = new URLSearchParams({
    client_id: process.env.MS_CLIENT_ID!, response_type: "code", redirect_uri: msRedirectUri(origin), response_mode: "query",
    scope: MS_SCOPES, state, login_hint: email, prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/authorize?${p}`;
}

async function token(body: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${tenant()}/oauth2/v2.0/token`, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.MS_CLIENT_ID!, client_secret: process.env.MS_CLIENT_SECRET!, scope: MS_SCOPES, ...body }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description?.split("\r\n")[0] || json.error || "Microsoft token request failed");
  return json as { access_token: string; refresh_token?: string; scope: string };
}

export const msExchange = (code: string, origin: string) => token({ grant_type: "authorization_code", code, redirect_uri: msRedirectUri(origin) });

// Microsoft rotates the refresh token on every use, so the new one is saved each time.
export async function msToken(acc: { id: string; tokenEnc: string }) {
  const t = await token({ grant_type: "refresh_token", refresh_token: decrypt(acc.tokenEnc) });
  if (t.refresh_token) await db.update(accounts).set({ tokenEnc: encrypt(t.refresh_token) }).where(eq(accounts.id, acc.id));
  return t.access_token;
}

export async function saveMsAccount(employeeId: string, email: string, refreshToken: string, scopes: string) {
  const tokenEnc = encrypt(refreshToken);
  await db.insert(accounts).values({ employeeId, provider: "microsoft", email, tokenEnc, scopes, mailState: {} })
    .onConflictDoUpdate({ target: [accounts.employeeId, accounts.provider], set: { email, tokenEnc, scopes, lastError: null } });
}

export async function msAccountFor(employeeId: string) {
  const [a] = await db.select().from(accounts).where(and(eq(accounts.employeeId, employeeId), eq(accounts.provider, "microsoft"))).limit(1);
  return a ?? null;
}

async function graph<T>(tok: string, pathOrUrl: string, params: Record<string, string> = {}, headers: Record<string, string> = {}): Promise<T> {
  const url = pathOrUrl.startsWith("https://") ? pathOrUrl : `${GRAPH}${pathOrUrl}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { headers: { authorization: `Bearer ${tok}`, ...headers } });
  if (!res.ok) throw new Error(`Graph ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json() as Promise<T>;
}

export const me = (tok: string) => graph<{ mail?: string; userPrincipalName: string }>(tok, "/me", { $select: "mail,userPrincipalName" });

export type GraphMessage = {
  id: string; conversationId: string; internetMessageId?: string; subject?: string; receivedDateTime: string; isDraft?: boolean; hasAttachments?: boolean;
  from?: { emailAddress: { name?: string; address: string } }; toRecipients?: { emailAddress: { name?: string; address: string } }[];
  ccRecipients?: { emailAddress: { name?: string; address: string } }[]; uniqueBody?: { content: string }; lastModifiedDateTime?: string;
};

const SELECT = "id,conversationId,internetMessageId,subject,receivedDateTime,isDraft,hasAttachments,from,toRecipients,ccRecipients,lastModifiedDateTime";

// Messages that involve any of these addresses or domains, newest first, one page at a time.
export function searchMessages(tok: string, terms: string[], sinceIso: string, next?: string | null) {
  if (next) return graph<{ value: GraphMessage[]; "@odata.nextLink"?: string }>(tok, next);
  const kql = `(${terms.map((t) => `participants:${t}`).join(" OR ")}) AND received>=${sinceIso.slice(0, 10)}`;
  return graph<{ value: GraphMessage[]; "@odata.nextLink"?: string }>(tok, "/me/messages", { $search: `"${kql}"`, $select: SELECT, $top: "50" });
}

// A whole conversation, with only the new part of each message (Graph strips the quoted history itself).
export async function conversation(tok: string, conversationId: string) {
  const r = await graph<{ value: GraphMessage[] }>(tok, "/me/messages",
    { $filter: `conversationId eq '${conversationId.replace(/'/g, "''")}'`, $select: `${SELECT},uniqueBody`, $top: "100" },
    { Prefer: 'outlook.body-content-type="text"' });
  return r.value.sort((a, b) => a.receivedDateTime.localeCompare(b.receivedDateTime));
}

export type GraphEvent = {
  id: string; subject?: string; isCancelled?: boolean; isAllDay?: boolean; start: { dateTime: string }; end?: { dateTime: string };
  attendees?: { emailAddress: { address: string; name?: string }; type?: string }[]; location?: { displayName?: string };
  onlineMeeting?: { joinUrl?: string } | null; webLink?: string;
};

export async function calendarView(tok: string, from: Date, to: Date) {
  const out: GraphEvent[] = [];
  let next: string | undefined;
  do {
    const r: { value: GraphEvent[]; "@odata.nextLink"?: string } = next
      ? await graph(tok, next, {}, { Prefer: 'outlook.timezone="UTC"' })
      : await graph(tok, "/me/calendarView", { startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "200",
          $select: "id,subject,isCancelled,isAllDay,start,end,attendees,location,onlineMeeting,webLink" }, { Prefer: 'outlook.timezone="UTC"' });
    out.push(...r.value);
    next = r["@odata.nextLink"];
  } while (next && out.length < 2000);
  return out;
}
