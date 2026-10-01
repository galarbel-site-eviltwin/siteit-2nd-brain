import { createHash } from "node:crypto";
import { and, eq, gte, lt, notInArray, or, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, chunks, employees, events, items, mailThreads } from "@/lib/db/schema";
import { chunkChat } from "@/lib/ingest/chunk";
import type { ChatMessage } from "@/lib/ingest/whatsapp";
import { attachments, getThread, googleToken, header, listEvents, listThreads, messageText, type GmailMessage } from "./google";
import { clientIndex, gmailQueries, matchClient, parseAddresses, type ClientIndex } from "./match";

type Account = typeof accounts.$inferSelect;
type MailState = { key?: string; qi?: number; pageToken?: string | null; backfillDone?: boolean; since?: string | null };

const OURS = /@(eviltwin\.io|siteit\.co\.il)$/i;

// ---------- mail ----------

// One thread becomes one item, rebuilt whenever the thread grows. The same thread in two mailboxes is one item.
async function upsertThread(acc: Account, token: string, threadId: string, historyId: string, idx: ClientIndex) {
  const [known] = await db.select().from(mailThreads).where(and(eq(mailThreads.accountId, acc.id), eq(mailThreads.threadId, threadId))).limit(1);
  if (known && known.historyId === historyId) return "same";

  const t = await getThread(token, threadId);
  const msgs = t.messages.filter((m) => !m.labelIds?.includes("DRAFT"));
  if (!msgs.length) return "empty";

  const people = new Map<string, string | null>();
  for (const m of msgs) for (const h of ["From", "To", "Cc"]) for (const a of parseAddresses(header(m, h))) if (!people.has(a.email)) people.set(a.email, a.name);
  const external = [...people.keys()].filter((e) => !OURS.test(e));
  const match = matchClient(external, idx);
  const record = (v: Partial<typeof mailThreads.$inferInsert>) =>
    db.insert(mailThreads).values({ accountId: acc.id, threadId, historyId, messageCount: msgs.length, ...v })
      .onConflictDoUpdate({ target: [mailThreads.accountId, mailThreads.threadId], set: { historyId, messageCount: msgs.length, syncedAt: new Date(), ...v } });
  if (!match) { await record({ itemId: null, skipped: "לא זוהה לקוח" }); return "skipped"; }

  const name = (m: GmailMessage) => { const a = parseAddresses(header(m, "From"))[0]; return a ? a.name || a.email : "לא ידוע"; };
  const chat: ChatMessage[] = msgs.map((m) => {
    const files = attachments(m);
    const body = messageText(m) || "(בלי טקסט)";
    return { at: new Date(Number(m.internalDate)), sender: name(m), text: files.length ? `${body}\n[קבצים מצורפים: ${files.join(", ")}]` : body, media: false };
  });
  const subject = header(msgs[0], "Subject").replace(/^((re|fwd?|הע|השב):\s*)+/i, "").trim() || "(בלי נושא)";
  const rootId = header(msgs[0], "Message-ID") || `${acc.id}:${threadId}`;
  const participants = [...new Set(msgs.map(name))];
  const meta = { threadId, rootMessageId: rootId, messages: msgs.length, lastAt: chat[chat.length - 1].at, link: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(acc.email)}#all/${threadId}`, mailbox: acc.email };

  // The same conversation already came in through a colleague's mailbox: keep the fuller copy, never two.
  const [twin] = known?.itemId ? [] : await db.select({ id: items.id, meta: items.meta }).from(items)
    .where(and(eq(items.kind, "email"), sql`${items.meta}->>'rootMessageId' = ${rootId}`)).limit(1);
  const itemId = known?.itemId ?? twin?.id ?? null;
  if (twin && ((twin.meta as { messages?: number })?.messages ?? 0) >= msgs.length) { await record({ itemId: twin.id, skipped: null }); return "same"; }

  const pieces = chunkChat(chat);
  const values = {
    kind: "email" as const, source: "gmail" as const, title: subject, clientId: match.clientId, assignment: "confirmed" as const,
    assignmentReason: `מייל עם ${match.reason}`, occurredAt: chat[0].at, participants, status: "ready" as const, meta, summary: null, summarizedAt: null,
  };
  let id = itemId;
  await db.transaction(async (tx) => {
    if (id) {
      await tx.update(items).set(values).where(eq(items.id, id));
      await tx.delete(chunks).where(eq(chunks.itemId, id));
    } else {
      [{ id }] = await tx.insert(items).values({ ...values, createdBy: acc.employeeId, fileName: null, contentHash: `mail:${rootId}` }).returning({ id: items.id });
    }
    if (pieces.length) await tx.insert(chunks).values(pieces.map((c, seq) => ({ itemId: id!, seq, text: c.text, speaker: c.speaker, startMs: c.startMs, at: c.at })));
  });
  await record({ itemId: id, skipped: null });
  return itemId ? "updated" : "added";
}

async function syncMail(acc: Account, token: string, idx: ClientIndex, deadline: number, maxThreads: number) {
  const st: MailState = { ...(acc.mailState as MailState) };
  const key = createHash("sha1").update([...idx.domains.keys(), ...idx.emails.keys()].sort().join(",")).digest("hex").slice(0, 12);
  // New clients or domains: walk the last 12 months again so their history comes in too (known threads are skipped cheaply).
  if (st.key !== key) Object.assign(st, { key, qi: 0, pageToken: null, backfillDone: false });
  const since = st.since ? Math.floor(new Date(st.since).getTime() / 1000) - 86400 : null;
  const queries = gmailQueries(idx, st.backfillDone && since ? `after:${since}` : "newer_than:365d");
  const started = new Date();
  const res = { added: 0, updated: 0, skipped: 0, more: false };
  if (!queries.length) return { ...res, note: "אין עדיין דומיינים או כתובות של לקוחות" };

  let n = 0;
  outer: for (let qi = st.backfillDone ? 0 : st.qi ?? 0; qi < queries.length; qi++) {
    let pageToken = st.backfillDone ? null : qi === st.qi ? st.pageToken ?? null : null;
    do {
      const page = await listThreads(token, queries[qi], pageToken);
      for (const th of page.threads ?? []) {
        if (Date.now() > deadline || n >= maxThreads) { Object.assign(st, { qi, pageToken }); res.more = true; break outer; }
        const r = await upsertThread(acc, token, th.id, (th as { historyId?: string }).historyId ?? "", idx).catch((e) => { console.error("thread failed", th.id, (e as Error).message); return "failed"; });
        if (r === "added") res.added++; else if (r === "updated") res.updated++; else if (r === "skipped") res.skipped++;
        if (r !== "same") n++;
      }
      pageToken = page.nextPageToken ?? null;
    } while (pageToken);
  }
  if (!res.more) Object.assign(st, { backfillDone: true, qi: 0, pageToken: null, since: started.toISOString() });
  await db.update(accounts).set({ mailState: st }).where(eq(accounts.id, acc.id));
  return res;
}

// ---------- calendar ----------

// Meetings two months back and two months ahead. A meeting is an event with at least one other person.
async function syncCalendar(acc: Account, token: string, idx: ClientIndex) {
  const from = new Date(Date.now() - 60 * 86400_000), to = new Date(Date.now() + 60 * 86400_000);
  const list = await listEvents(token, from, to);
  const keep: string[] = [];
  for (const e of list) {
    if (e.status === "cancelled") continue;
    const others = (e.attendees ?? []).filter((a) => !a.self && !a.resource).map((a) => a.email.toLowerCase());
    if (!others.length) continue;
    const startAt = new Date(e.start.dateTime ?? `${e.start.date}T00:00:00+03:00`);
    const endAt = e.end ? new Date(e.end.dateTime ?? `${e.end.date}T00:00:00+03:00`) : null;
    const link = e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? (e.location?.match(/https?:\/\/\S+/)?.[0] ?? null);
    const match = matchClient(others.filter((x) => !OURS.test(x)), idx);
    const v = { title: e.summary?.trim() || "(בלי כותרת)", startAt, endAt, allDay: !e.start.dateTime, attendees: others, location: e.location ?? null, link, clientId: match?.clientId ?? null, updatedAt: new Date() };
    await db.insert(events).values({ accountId: acc.id, externalId: e.id, ...v }).onConflictDoUpdate({ target: [events.accountId, events.externalId], set: v });
    keep.push(e.id);
  }
  // Events that disappeared from the calendar inside the window were cancelled or moved out.
  await db.delete(events).where(and(eq(events.accountId, acc.id), gte(events.startAt, from), lt(events.startAt, to), keep.length ? notInArray(events.externalId, keep) : undefined));
  return { events: keep.length };
}

// ---------- one account, all accounts ----------

export async function syncAccount(acc: Account, budgetMs = 60_000, maxThreads = 40) {
  const [lease] = await db.update(accounts).set({ lockedUntil: sql`now() + interval '5 minutes'`, lastSyncAt: new Date() })
    .where(and(eq(accounts.id, acc.id), or(isNull(accounts.lockedUntil), lt(accounts.lockedUntil, sql`now()`)))).returning({ id: accounts.id });
  if (!lease) return { ok: false as const, reason: "busy" };
  try {
    const [owner] = await db.select({ active: employees.active }).from(employees).where(eq(employees.id, acc.employeeId)).limit(1);
    if (!owner?.active) throw new Error("העובד כבר לא פעיל");
    const token = await googleToken(acc);
    const idx = await clientIndex();
    const cal = await syncCalendar(acc, token, idx).catch((e) => ({ error: (e as Error).message }));
    const mail = await syncMail(acc, token, idx, Date.now() + budgetMs, maxThreads);
    const result = { mail, cal };
    await db.update(accounts).set({ lastError: null, lastResult: result, lockedUntil: null }).where(eq(accounts.id, acc.id));
    return { ok: true as const, ...result };
  } catch (e) {
    const reason = (e as Error).message;
    await db.update(accounts).set({ lastError: reason, lockedUntil: null }).where(eq(accounts.id, acc.id));
    return { ok: false as const, reason };
  }
}

export async function syncAllAccounts(budgetMs = 90_000) {
  const all = await db.select().from(accounts).where(eq(accounts.provider, "google"));
  const per = Math.max(20_000, Math.floor(budgetMs / Math.max(1, all.length)));
  const out: Record<string, unknown> = {};
  for (const a of all) out[a.email] = await syncAccount(a, per);
  return out;
}
