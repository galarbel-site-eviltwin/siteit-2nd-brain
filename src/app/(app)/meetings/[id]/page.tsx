import { ArrowRight, CalendarBlank, Users, VideoCamera, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ClientMark } from "@/components/client-mark";
import { FactRow } from "@/components/fact-row";
import { KindIcon } from "@/components/kind-icon";
import { db } from "@/lib/db";
import { clientAliases, clients, contacts, events, facts, items } from "@/lib/db/schema";
import { TRUSTED } from "@/lib/facts";
import { fmtDate, fmtDateTime } from "@/lib/format";
import { describe } from "@/lib/item-label";
import { requireEmployee } from "@/lib/session";

const hm = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
// A chat or a mail thread goes on after its first message: its latest message is when it last happened.
const lastAt = (r: { occurredAt: Date | null; recordedAt: Date; meta: unknown }) => {
  const l = (r.meta as { lastAt?: string } | null)?.lastAt;
  return l ? new Date(l) : r.occurredAt ?? r.recordedAt;
};
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);

// Everything worth knowing before a meeting, built from what the brain already holds.
// The parts that come from AI (picture, summaries, facts) appear once they exist; the rest works today.
export default async function MeetingBrief({ params }: PageProps<"/meetings/[id]">) {
  await requireEmployee();
  const { id } = await params;
  const [ev] = await db.select().from(events).where(eq(events.id, id)).limit(1);
  if (!ev) notFound();
  const [client] = ev.clientId ? await db.select().from(clients).where(eq(clients.id, ev.clientId)).limit(1) : [];

  const head = (
    <>
      <Link href={client ? `/clients/${client.id}` : "/"} className="back"><ArrowRight size={20} />{client ? client.name : "היום שלי"}</Link>
      <header className="chero">
        <span className="sq lg" data-src="meet" aria-hidden="true"><CalendarBlank size={28} weight="fill" /></span>
        <div>
          <p className="kicker">תדריך לפני פגישה</p>
          <h1 className="item-title">{ev.title}</h1>
          <div className="meta">
            <span>{fmtDate(ev.startAt)}{ev.allDay ? "" : `, ${hm.format(ev.startAt)}${ev.endAt ? `-${hm.format(ev.endAt)}` : ""}`}</span>
            <span><Users size={18} />{ev.attendees.length} משתתפים</span>
            {ev.location && !/^https?:/.test(ev.location) && <span>{ev.location}</span>}
          </div>
        </div>
        {ev.link && <a className="btn btn-primary btn-sm head-action" href={ev.link} target="_blank" rel="noreferrer"><VideoCamera size={18} />הצטרפות</a>}
      </header>
    </>
  );

  if (!client) {
    return (
      <>
        {head}
        <section className="card">
          <h2>לא זוהה לקוח לפגישה הזו</h2>
          <p className="muted">המוח מזהה לקוח לפי המיילים של המשתתפים. אם זו פגישה עם לקוח, צריך להוסיף לו את הדומיין או איש קשר עם המייל, והתדריך יתמלא.</p>
          <p className="ltr small" style={{ marginTop: 10 }}>{ev.attendees.join(", ")}</p>
        </section>
      </>
    );
  }

  const [recent, trusted, people, domain, pastEvents] = await Promise.all([
    db.select().from(items).where(and(eq(items.clientId, client.id), eq(items.assignment, "confirmed"))).orderBy(desc(sql`coalesce(${items.occurredAt}, ${items.recordedAt})`)).limit(12),
    db.select({ f: facts, itemTitle: items.title }).from(facts).innerJoin(items, eq(items.id, facts.itemId))
      .where(and(eq(facts.clientId, client.id), inArray(facts.status, [...TRUSTED]))).orderBy(desc(facts.occurredAt)).limit(80),
    db.select().from(contacts).where(eq(contacts.clientId, client.id)),
    db.select({ value: clientAliases.value }).from(clientAliases).where(and(eq(clientAliases.clientId, client.id), eq(clientAliases.kind, "domain"))).limit(1),
    db.select({ title: events.title, startAt: events.startAt }).from(events)
      .where(and(eq(events.clientId, client.id), lt(events.startAt, ev.startAt), gte(events.startAt, new Date(ev.startAt.getTime() - 60 * 86400_000)))).orderBy(desc(events.startAt)).limit(20),
  ]);

  const before = recent.filter((r) => (r.occurredAt ?? r.recordedAt) <= ev.startAt).sort((a, b) => lastAt(b).getTime() - lastAt(a).getTime());
  const lastMeeting = before.find((r) => r.kind === "meeting");
  const lastAny = before[0];
  const decisions = trusted.filter((t) => t.f.kind === "decision").slice(0, 8);
  const commitments = trusted.filter((t) => t.f.kind === "commitment" && !t.f.done).slice(0, 10);
  const prices = trusted.filter((t) => t.f.kind === "price").slice(0, 5);
  const requests = trusted.filter((t) => t.f.kind === "request").slice(0, 6);
  const openFromSummaries = before.slice(0, 4).flatMap((r) => (r.summary?.open ?? []).map((p) => ({ text: p.text, item: r }))).slice(0, 8);

  // Meetings that happened but left nothing the brain can read: say so instead of pretending to know.
  const seenDays = new Set(recent.filter((r) => r.kind === "meeting").map((r) => dayKey(r.occurredAt ?? r.recordedAt)));
  const uniqueEvents = [...new Map(pastEvents.map((p) => [`${p.title}|${p.startAt.getTime()}`, p])).values()];
  const gaps = uniqueEvents.filter((p) => !seenDays.has(dayKey(p.startAt))).slice(0, 5);

  return (
    <>
      {head}
      <div className="brief">
        <section className="card brief-client">
          <div className="conn-head">
            <ClientMark id={client.id} name={client.name} domain={domain[0]?.value} size={48} />
            <div><h2><Link href={`/clients/${client.id}`}>{client.name}</Link></h2>{domain[0] && <span className="sub ltr">{domain[0].value}</span>}</div>
          </div>
          {client.summary ? <p className="sum-about">{client.summary.overview}</p> : <p className="muted">עוד אין תמונת מצב. היא תיכתב כשהמפתח של Claude יופעל.</p>}
          {client.summary?.watch.length ? (
            <div className="sum-block warn"><h3>לשים לב</h3><ul>{client.summary.watch.map((p, i) => <li key={i}>{p.text}</li>)}</ul></div>
          ) : null}
          {people.length > 0 && <p className="small" style={{ marginTop: 12 }}><b>אנשי קשר:</b> {people.map((p) => p.name + (p.role ? ` (${p.role})` : "")).join(", ")}</p>}
        </section>

        <section className="card">
          <h2>הפעם הקודמת</h2>
          {lastMeeting ?? lastAny ? (() => {
            const r = (lastMeeting ?? lastAny)!;
            return (
              <>
                <Link href={`/items/${r.id}`} className="brief-item"><KindIcon kind={r.kind} source={r.source} size="sm" /><span><b>{r.title}</b><span className="sub">{describe(r.kind, r.source).label}, {fmtDate(lastAt(r))}</span></span></Link>
                {r.summary ? (
                  <>
                    <p style={{ marginTop: 10 }}>{r.summary.about}</p>
                    {r.summary.agreed.length > 0 && <div className="sum-block ok"><h3>מה סוכם</h3><ul>{r.summary.agreed.map((p, i) => <li key={i}>{p.text}</li>)}</ul></div>}
                  </>
                ) : <p className="muted small" style={{ marginTop: 8 }}>עוד אין ניתוח לפריט הזה.</p>}
                {!lastMeeting && <p className="hint">אין במוח תמלול של פגישה קודמת, זה הפריט האחרון שיש.</p>}
              </>
            );
          })() : <p className="muted">אין עדיין מידע על הלקוח במוח.</p>}
        </section>

        {gaps.length > 0 && (
          <section className="card brief-gaps">
            <h2><WarningCircle size={22} weight="fill" />מה חסר</h2>
            <ul>{gaps.map((g, i) => <li key={i}>אין תמלול לפגישה &quot;{g.title}&quot; מ-{fmtDateTime(g.startAt)}</li>)}</ul>
            <p className="hint">אפשר להעלות את התמלול מ-Timeless או מ-Zoom בקליטת מידע.</p>
          </section>
        )}

        <section className="card">
          <h2>התחייבויות פתוחות</h2>
          {commitments.length ? <div className="facts">{commitments.map(({ f, itemTitle }) => <FactRow key={f.id} f={f} itemTitle={itemTitle} />)}</div> : <p className="muted">אין התחייבויות פתוחות שהמוח מכיר.</p>}
        </section>

        <section className="card">
          <h2>החלטות בתוקף</h2>
          {decisions.length ? <div className="facts">{decisions.map(({ f, itemTitle }) => <FactRow key={f.id} f={f} itemTitle={itemTitle} />)}</div> : <p className="muted">אין החלטות שהמוח מכיר.</p>}
        </section>

        {(prices.length > 0 || requests.length > 0) && (
          <section className="card">
            <h2>מחירים ובקשות</h2>
            <div className="facts">{[...prices, ...requests].map(({ f, itemTitle }) => <FactRow key={f.id} f={f} itemTitle={itemTitle} />)}</div>
          </section>
        )}

        {openFromSummaries.length > 0 && (
          <section className="card">
            <h2>שאלות פתוחות</h2>
            <ul className="brief-open">{openFromSummaries.map((o, i) => <li key={i}>{o.text} <Link href={`/items/${o.item.id}`} className="sub">({o.item.title})</Link></li>)}</ul>
          </section>
        )}

        <section className="card">
          <h2>מה קרה לאחרונה</h2>
          <div className="rows">
            {before.slice(0, 6).map((r) => (
              <div key={r.id}>
                <KindIcon kind={r.kind} source={r.source} size="sm" />
                <span><Link href={`/items/${r.id}`}><b>{r.title}</b></Link><span className="sub">{describe(r.kind, r.source).label}</span></span>
                <span className="sub">{fmtDate(lastAt(r))}</span>
              </div>
            ))}
            {before.length === 0 && <p className="muted">אין פריטים לפני הפגישה.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
