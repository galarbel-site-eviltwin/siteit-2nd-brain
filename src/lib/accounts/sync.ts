import { createHash } from "node:crypto";
import { and, eq, gte, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { accounts, chunks, employees, events, items, mailThreads } from "@/lib/db/schema";
import { chunkChat } from "@/lib/ingest/chunk";
import type { ChatMessage } from "@/lib/ingest/whatsapp";
import { attachments, getThread, googleToken, header, listEvents, listThreads, messageText } from "./google";
import { clientIndex, gmailQueries, matchClient, parseAddresses, type ClientIndex } from "./match";
import { calendarView, conversation, msToken, searchMessages } from "./microsoft";

type Account = typeof accounts.$inferSelect;
type MailState = { key?: string; qi?: number; pageToken?: string | null; backfillDone?: boolean; since?: string | null };

const OURS = /@(eviltwin\.io|siteit\.co\.il)$/i;

// One mail, the same shape from Gmail and from Outlook.
type Mail = { at: Date; fromName: string | null; fromEmail: string; to: string[]; cc: string[]; subject: string; text: string; files: string[]; messageId: string };
type Thread = { id: string; version: string; mails: Mail[]; link: string };

// ---------- one thread, any provider ----------

// One thread becomes one item, rebuilt whenever it grows. The same conversation in two mailboxes
// (two colleagues, or Gmail and Outlook) is one item, keyed by the first mail's Message-ID.
async function upsertThread(acc: Account, t: Thread, idx: ClientIndex) {
  const record = (v: Partial<typeof mailThreads.$inferInsert>) =>
    db.insert(mailThreads).values({ accountId: acc.id, threadId: t.id, historyId: t.version, messageCount: t.mails.length, ...v })
      .onConflictDoUpdate({ target: [mailThreads.accountId, mailThreads.threadId], set: { historyId: t.version, messageCount: t.mails.length, syncedAt: new Date(), ...v } });
  const mails = t.mails;
  if (!mails.length) return "empty";

  const external = [...new Set(mails.flatMap((m) => [m.fromEmail, ...m.to, ...m.cc]))].filter((e) => e && !OURS.test(e));
  const match = matchClient(external, idx);
  if (!match) { await record({ itemId: null, skipped: "לא זוהה לקוח" }); return "skipped"; }

  const [known] = await db.select({ itemId: mailThreads.itemId }).from(mailThreads).where(and(eq(mailThreads.accountId, acc.id), eq(mailThreads.threadId, t.id))).limit(1);
  const rootId = mails[0].messageId || `${acc.id}:${t.id}`;
  const [twin] = known?.itemId ? [] : await db.select({ id: items.id, meta: items.meta }).from(items)
    .where(and(eq(items.kind, "email"), sql`${items.meta}->>'rootMessageId' = ${rootId}`)).limit(1);
  // A colleague's copy that already holds at least as much: point to it, never store twice.
  if (twin && ((twin.meta as { messages?: number })?.messages ?? 0) >= mails.length) { await record({ itemId: twin.id, skipped: null }); return "same"; }
  const itemId = known?.itemId ?? twin?.id ?? null;

  const chat: ChatMessage[] = mails.map((m) => ({
    at: m.at, sender: m.fromName || m.fromEmail || "לא ידוע", media: false,
    text: (m.text || "(בלי טקסט)") + (m.files.length ? `\n[קבצים מצורפים: ${m.files.join(", ")}]` : ""),
  }));
  const subject = mails[0].subject.replace(/^((re|fwd?|fw|הע|השב|תשובה):\s*)+/i, "").trim() || "(בלי נושא)";
  const participants = [...new Set(chat.map((c) => c.sender!))];
  const source = acc.provider === "microsoft" ? "outlook" as const : "gmail" as const;
  const meta = { threadId: t.id, rootMessageId: rootId, messages: mails.length, lastAt: mails[mails.length - 1].at, link: t.link, mailbox: acc.email };
  const values = {
    kind: "email" as const, source, title: subject, clientId: match.clientId, assignment: "confirmed" as const, topic: null,
    assignmentReason: `מייל עם ${match.reason}`, occurredAt: mails[0].at, participants, status: "ready" as const, meta, summary: null, summarizedAt: null,
  };
  const pieces = chunkChat(chat);
  let id = itemId;
  await db.transaction(async (tx) => {
    if (id) {
      await tx.update(items).set(values).where(eq(items.id, id));
      await tx.delete(chunks).where(eq(chunks.itemId, id));
    } else {
      [{ id }] = await tx.insert(items).values({ ...values, createdBy: acc.employeeId, contentHash: `mail:${rootId}` }).returning({ id: items.id });
    }
    if (pieces.length) await tx.insert(chunks).values(pieces.map((c, seq) => ({ itemId: id!, seq, text: c.text, speaker: c.speaker, startMs: c.startMs, at: c.at })));
  });
  await record({ itemId: id, skipped: null });
  return itemId ? "updated" : "added";
}

const known = async (accountId: string, threadId: string, version: string) => {
  const [k] = await db.select({ v: mailThreads.historyId }).from(mailThreads).where(and(eq(mailThreads.accountId, accountId), eq(mailThreads.threadId, threadId))).limit(1);
  return !!k && k.v === version;
};

const termsKey = (idx: ClientIndex) => createHash("sha1").update([...idx.domains.keys(), ...idx.emails.keys()].sort().join(",")).digest("hex").slice(0, 12);

// ---------- Gmail ----------

function gmailThread(acc: Account, raw: Awaited<ReturnType<typeof getThread>>, version: string): Thread {
  const mails = raw.messages.filter((m) => !m.labelIds?.includes("DRAFT")).map((m) => {
    const from = parseAddresses(header(m, "From"))[0];
    return {
      at: new Date(Number(m.internalDate)), fromName: from?.name ?? null, fromEmail: from?.email ?? "",
      to: parseAddresses(header(m, "To")).map((a) => a.email), cc: parseAddresses(header(m, "Cc")).map((a) => a.email),
      subject: header(m, "Subject"), text: messageText(m), files: attachments(m), messageId: header(m, "Message-ID"),
    };
  });
  return { id: raw.id, version, mails, link: `https://mail.google.com/mail/u/?authuser=${encodeURIComponent(acc.email)}#all/${raw.id}` };
}

async function syncGmail(acc: Account, token: string, idx: ClientIndex, deadline: number, maxThreads: number) {
  const st: MailState = { ...(acc.mailState as MailState) };
  const key = termsKey(idx);
  // New clients or domains: walk the last 12 months again so their history comes in too (known threads are skipped cheaply).
  if (st.key !== key) Object.assign(st, { key, qi: 0, pageToken: null, backfillDone: false });
  const since = st.since ? Math.floor(new Date(st.since).getTime() / 1000) - 86400 : null;
  const queries = gmailQueries(idx, st.backfillDone && since ? `after:${since}` : "newer_than:365d");
  const started = new Date();
  const res = { added: 0, updated: 0, skipped: 0, more: false };
  if (!queries.length) return { ...res, note: "אין עדיין דומיינים או כתובות של לקוחות" };

  let n = 0;
  outer: for (let qi = st.backfillDone ? 0 : st.qi ?? 0; qi < queries.length; qi++) {
    let pageToken = !st.backfillDone && qi === st.qi ? st.pageToken ?? null : null;
    do {
      const page = await listThreads(token, queries[qi], pageToken);
      for (const th of page.threads ?? []) {
        const version = (th as { historyId?: string }).historyId ?? "";
        if (await known(acc.id, th.id, version)) continue;
        if (Date.now() > deadline || n >= maxThreads) { Object.assign(st, { qi, pageToken }); res.more = true; break outer; }
        const r = await getThread(token, th.id).then((raw) => upsertThread(acc, gmailThread(acc, raw, version), idx))
          .catch((e) => { console.error("gmail thread failed", th.id, (e as Error).message); return "failed"; });
        if (r === "added") res.added++; else if (r === "updated") res.updated++; else if (r === "skipped") res.skipped++;
        n++;
      }
      pageToken = page.nextPageToken ?? null;
    } while (pageToken);
  }
  if (!res.more) Object.assign(st, { backfillDone: true, qi: 0, pageToken: null, since: started.toISOString() });
  await db.update(accounts).set({ mailState: st }).where(eq(accounts.id, acc.id));
  return res;
}

// ---------- Outlook ----------

async function syncOutlook(acc: Account, token: string, idx: ClientIndex, deadline: number, maxThreads: number) {
  const st: MailState = { ...(acc.mailState as MailState) };
  const key = termsKey(idx);
  if (st.key !== key) Object.assign(st, { key, qi: 0, pageToken: null, backfillDone: false });
  const terms = [...idx.domains.keys(), ...idx.emails.keys()];
  const res = { added: 0, updated: 0, skipped: 0, more: false };
  if (!terms.length) return { ...res, note: "אין עדיין דומיינים או כתובות של לקוחות" };
  const started = new Date();
  const sinceIso = st.backfillDone && st.since ? new Date(new Date(st.since).getTime() - 86400_000).toISOString() : new Date(Date.now() - 365 * 86400_000).toISOString();
  const groups: string[][] = [];
  for (let i = 0; i < terms.length; i += 15) groups.push(terms.slice(i, i + 15));

  let n = 0;
  const seen = new Set<string>();
  outer: for (let qi = st.backfillDone ? 0 : st.qi ?? 0; qi < groups.length; qi++) {
    let next = !st.backfillDone && qi === st.qi ? st.pageToken ?? null : null;
    do {
      const page = await searchMessages(token, groups[qi], sinceIso, next);
      for (const m of page.value) {
        if (seen.has(m.conversationId)) continue;
        seen.add(m.conversationId);
        const version = m.lastModifiedDateTime ?? m.receivedDateTime;
        if (await known(acc.id, m.conversationId, version)) continue;
        if (Date.now() > deadline || n >= maxThreads) { Object.assign(st, { qi, pageToken: next }); res.more = true; break outer; }
        const r = await conversation(token, m.conversationId).then((list) => upsertThread(acc, {
          id: m.conversationId, version, link: list[list.length - 1]?.id ? `https://outlook.office.com/mail/deeplink/read/${encodeURIComponent(list[list.length - 1].id)}` : "https://outlook.office.com/mail/",
          mails: list.filter((x) => !x.isDraft).map((x) => ({
            at: new Date(x.receivedDateTime), fromName: x.from?.emailAddress.name ?? null, fromEmail: (x.from?.emailAddress.address ?? "").toLowerCase(),
            to: (x.toRecipients ?? []).map((a) => a.emailAddress.address.toLowerCase()), cc: (x.ccRecipients ?? []).map((a) => a.emailAddress.address.toLowerCase()),
            subject: x.subject ?? "", text: (x.uniqueBody?.content ?? "").replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim(),
            files: x.hasAttachments ? ["(יש קבצים מצורפים)"] : [], messageId: x.internetMessageId ?? "",
          })),
        }, idx)).catch((e) => { console.error("outlook thread failed", m.conversationId, (e as Error).message); return "failed"; });
        if (r === "added") res.added++; else if (r === "updated") res.updated++; else if (r === "skipped") res.skipped++;
        n++;
      }
      next = page["@odata.nextLink"] ?? null;
    } while (next);
  }
  if (!res.more) Object.assign(st, { backfillDone: true, qi: 0, pageToken: null, since: started.toISOString() });
  await db.update(accounts).set({ mailState: st }).where(eq(accounts.id, acc.id));
  return res;
}

// ---------- calendar ----------

type Ev = { id: string; title: string; startAt: Date; endAt: Date | null; allDay: boolean; others: string[]; location: string | null; link: string | null };

// Meetings two months back and two months ahead. A meeting is an event with at least one other person.
async function saveEvents(acc: Account, list: Ev[], idx: ClientIndex, from: Date, to: Date) {
  const keep: string[] = [];
  for (const e of list) {
    if (!e.others.length) continue;
    const match = matchClient(e.others.filter((x) => !OURS.test(x)), idx);
    const v = { title: e.title, startAt: e.startAt, endAt: e.endAt, allDay: e.allDay, attendees: e.others, location: e.location, link: e.link, clientId: match?.clientId ?? null, updatedAt: new Date() };
    await db.insert(events).values({ accountId: acc.id, externalId: e.id, ...v }).onConflictDoUpdate({ target: [events.accountId, events.externalId], set: v });
    keep.push(e.id);
  }
  // Events that disappeared from the calendar inside the window were cancelled or moved out.
  await db.delete(events).where(and(eq(events.accountId, acc.id), gte(events.startAt, from), lt(events.startAt, to), keep.length ? notInArray(events.externalId, keep) : undefined));
  return { events: keep.length };
}

async function syncCalendar(acc: Account, token: string, idx: ClientIndex) {
  const from = new Date(Date.now() - 60 * 86400_000), to = new Date(Date.now() + 60 * 86400_000);
  let list: Ev[];
  if (acc.provider === "microsoft") {
    list = (await calendarView(token, from, to)).filter((e) => !e.isCancelled).map((e) => ({
      id: e.id, title: e.subject?.trim() || "(בלי כותרת)", startAt: new Date(`${e.start.dateTime}Z`), endAt: e.end ? new Date(`${e.end.dateTime}Z`) : null, allDay: !!e.isAllDay,
      others: (e.attendees ?? []).filter((a) => a.type !== "resource" && a.emailAddress.address.toLowerCase() !== acc.email.toLowerCase()).map((a) => a.emailAddress.address.toLowerCase()),
      location: e.location?.displayName || null, link: e.onlineMeeting?.joinUrl ?? null,
    }));
  } else {
    list = (await listEvents(token, from, to)).filter((e) => e.status !== "cancelled").map((e) => ({
      id: e.id, title: e.summary?.trim() || "(בלי כותרת)", startAt: new Date(e.start.dateTime ?? `${e.start.date}T00:00:00+03:00`),
      endAt: e.end ? new Date(e.end.dateTime ?? `${e.end.date}T00:00:00+03:00`) : null, allDay: !e.start.dateTime,
      others: (e.attendees ?? []).filter((a) => !a.self && !a.resource).map((a) => a.email.toLowerCase()), location: e.location ?? null,
      link: e.hangoutLink ?? e.conferenceData?.entryPoints?.find((p) => p.entryPointType === "video")?.uri ?? (e.location?.match(/https?:\/\/\S+/)?.[0] ?? null),
    }));
  }
  return saveEvents(acc, list, idx, from, to);
}

// ---------- one account, all accounts ----------

export async function syncAccount(acc: Account, budgetMs = 60_000, maxThreads = 40) {
  const [lease] = await db.update(accounts).set({ lockedUntil: sql`now() + interval '5 minutes'`, lastSyncAt: new Date() })
    .where(and(eq(accounts.id, acc.id), or(isNull(accounts.lockedUntil), lt(accounts.lockedUntil, sql`now()`)))).returning({ id: accounts.id });
  if (!lease) return { ok: false as const, reason: "busy" };
  try {
    const [owner] = await db.select({ active: employees.active }).from(employees).where(eq(employees.id, acc.employeeId)).limit(1);
    if (!owner?.active) throw new Error("העובד כבר לא פעיל");
    const token = acc.provider === "microsoft" ? await msToken(acc) : await googleToken(acc);
    const idx = await clientIndex();
    const cal = await syncCalendar(acc, token, idx).catch((e) => ({ error: (e as Error).message }));
    const deadline = Date.now() + budgetMs;
    const mail = acc.provider === "microsoft" ? await syncOutlook(acc, token, idx, deadline, maxThreads) : await syncGmail(acc, token, idx, deadline, maxThreads);
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
  const all = await db.select().from(accounts);
  const per = Math.max(20_000, Math.floor(budgetMs / Math.max(1, all.length)));
  const out: Record<string, unknown> = {};
  for (const a of all) out[`${a.provider}:${a.email}`] = await syncAccount(a, per);
  return out;
}
