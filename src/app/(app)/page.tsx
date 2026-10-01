import { ArrowLeft, Buildings, CalendarBlank, CheckCircle, Circle, PlugsConnected, TrayArrowDown, VideoCamera } from "@phosphor-icons/react/dist/ssr";
import { and, asc, count, eq, gte, inArray, lt } from "drizzle-orm";
import Link from "next/link";
import { KindIcon } from "@/components/kind-icon";
import { pendingCount, recentItems } from "@/lib/clients";
import { db } from "@/lib/db";
import { accounts, clients, events, items } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

// What the brain can do today, kept honest. Update when a phase lands.
const done = [
  "לקוחות, אנשי קשר, דומיינים וציר זמן לכל לקוח",
  "קליטה: וואטסאפ, Timeless, Zoom, מסמכים ו-Google Drive",
  "Gmail ויומן Google: מיילים עם לקוחות ופגישות",
  "שאל את המוח: חיפוש במקורות עם הפניה לכל קטע",
];
const next = [
  "ניתוח ותשובות של המוח (מחכה למפתח Claude)",
  "Outlook ויומן Microsoft",
  "ידע החברה ותור לבדיקה",
];

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(d);
const hm = new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", hour: "2-digit", minute: "2-digit" });
const dayName = (d: Date) => {
  const k = dayKey(d), today = dayKey(new Date()), tomorrow = dayKey(new Date(Date.now() + 86400_000));
  return k === today ? "היום" : k === tomorrow ? "מחר" : new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "numeric" }).format(d);
};

const greeting = () => {
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Jerusalem", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h < 12 ? "בוקר טוב" : h < 17 ? "צהריים טובים" : h < 21 ? "ערב טוב" : "לילה טוב";
};

export default async function Today() {
  const me = await requireEmployee();
  const [[{ n: clientCount }], [{ n: itemCount }], pending, recent] = await Promise.all([
    db.select({ n: count() }).from(clients).where(eq(clients.status, "active")),
    db.select({ n: count() }).from(items).where(eq(items.assignment, "confirmed")),
    pendingCount(),
    recentItems(6),
  ]);
  // My meetings for the coming week, from my own connected calendar.
  const mine = await db.select({ id: accounts.id }).from(accounts).where(eq(accounts.employeeId, me.id));
  const acc = mine[0];
  const startOfToday = new Date(`${dayKey(new Date())}T00:00:00+03:00`);
  const rows = acc
    ? await db.select({ e: events, clientName: clients.name }).from(events).leftJoin(clients, eq(clients.id, events.clientId))
        .where(and(inArray(events.accountId, mine.map((a) => a.id)), gte(events.startAt, startOfToday), lt(events.startAt, new Date(startOfToday.getTime() + 7 * 86400_000))))
        .orderBy(asc(events.startAt)).limit(60)
    : [];
  // The same meeting in the Google and the Microsoft calendar is shown once.
  const seenMeet = new Set<string>();
  const meetings = rows.filter(({ e }) => { const k = `${e.title.trim().toLowerCase()}|${e.startAt.getTime()}`; if (seenMeet.has(k)) return false; seenMeet.add(k); return true; });
  const byDay = new Map<string, typeof meetings>();
  for (const m of meetings) { const k = dayName(m.e.startAt); byDay.set(k, [...(byDay.get(k) ?? []), m]); }

  return (
    <>
      <div className="page-head">
        <p className="kicker">{new Intl.DateTimeFormat("he-IL", { timeZone: "Asia/Jerusalem", weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
        <h1>{greeting()}, {me.name.split(" ")[0]}</h1>
        <p>{pending ? `יש ${pending} פריטים שמחכים לאישור שיוך.` : clientCount ? "הכול משויך. אפשר להוסיף עוד ידע." : "כדי שהמוח יתחיל ללמוד, צריך לקוח ראשון ומשהו שלו להעלות."}</p>
      </div>

      <div className="stats">
        <Link href="/clients" className="card stat"><Buildings size={26} /><b>{clientCount}</b><span>לקוחות פעילים</span></Link>
        <Link href="/ingest" className="card stat"><TrayArrowDown size={26} /><b>{itemCount}</b><span>פריטים שהמוח מכיר</span></Link>
        <Link href="/ingest" className={`card stat ${pending ? "attn" : ""}`}><CheckCircle size={26} /><b>{pending}</b><span>מחכים לשיוך</span></Link>
      </div>

      <section className="card meetings">
        <div className="card-head"><h2><CalendarBlank size={22} />הפגישות שלי השבוע</h2>{acc && <Link href="/connections" className="btn btn-sm btn-ghost">חיבורים<ArrowLeft size={16} /></Link>}</div>
        {!acc ? (
          <p className="muted">כדי לראות כאן את הפגישות, צריך לחבר את היומן שלך. <Link href="/connections" className="btn btn-sm btn-primary" style={{ marginInlineStart: 8 }}><PlugsConnected size={16} />חיבור Gmail ויומן</Link></p>
        ) : meetings.length === 0 ? (
          <p className="muted">אין פגישות עם אנשים נוספים בשבוע הקרוב.</p>
        ) : (
          [...byDay.entries()].map(([d, list]) => (
            <div key={d} className="mday">
              <h3>{d}</h3>
              {list.map(({ e, clientName }) => (
                <div key={e.id} className="meet">
                  <span className="meet-time ltr">{e.allDay ? "כל היום" : hm.format(e.startAt)}</span>
                  <span className="meet-body"><Link href={`/meetings/${e.id}`}><b>{e.title}</b></Link><span className="sub">{clientName ? <Link href={`/clients/${e.clientId}`}>{clientName}</Link> : `${e.attendees.length} משתתפים`}</span></span>
                  <span className="meet-actions">
                    <Link className="btn btn-sm btn-ghost" href={`/meetings/${e.id}`}>תדריך</Link>
                    {e.link && <a className="btn btn-sm btn-ghost" href={e.link} target="_blank" rel="noreferrer"><VideoCamera size={16} />הצטרפות</a>}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </section>

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>נקלט לאחרונה</h2><Link href="/ingest" className="btn btn-sm btn-ghost">להוספה<ArrowLeft size={16} /></Link></div>
          <div className="rows">
            {recent.length === 0 && <p className="muted">עוד לא נקלט כלום. <Link href="/ingest">להעלאה ראשונה</Link></p>}
            {recent.map((r) => (
              <div key={r.id}>
                <KindIcon kind={r.kind} source={r.source} size="sm" />
                <span><Link href={`/items/${r.id}`}><b>{r.title}</b></Link><span className="sub">{r.clientName ?? "לא משויך"}</span></span>
                <span className="sub">{ago(r.recordedAt)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>מה המוח יודע לעשות היום</h2>
          {done.map((t) => <p key={t} className="check"><CheckCircle size={22} weight="fill" color="#0E9E63" />{t}</p>)}
          <h2 style={{ marginTop: 18 }}>מה בדרך</h2>
          {next.map((t) => <p key={t} className="check"><Circle size={22} color="var(--ink-3)" />{t}</p>)}
        </section>
      </div>
    </>
  );
}
