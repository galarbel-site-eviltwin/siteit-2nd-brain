import { ArrowLeft, Buildings, CheckCircle, Circle, TrayArrowDown } from "@phosphor-icons/react/dist/ssr";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { KindIcon } from "@/components/kind-icon";
import { pendingCount, recentItems } from "@/lib/clients";
import { db } from "@/lib/db";
import { clients, items } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

// What the brain can do today, kept honest. Update when a phase lands.
const done = [
  "כניסה עם Google, רק לעובדי סייט איט שברשימה",
  "לקוחות: יצירה, עריכה, אנשי קשר, דומיינים וכינויים",
  "קליטה: ייצוא וואטסאפ, תמלולי פגישות, PDF, DOCX וטקסט",
  "הצעת שיוך אוטומטית ללקוח, עם אישור של אדם",
  "ציר זמן לכל לקוח לפי מתי שדברים קרו",
];
const next = [
  "שלב 2: שאל את המוח, עם ציטוט מקור לכל תשובה",
  "תמלול הקלטות וקריאת טקסט מצילומי מסך",
  "שלב 3: חילוץ החלטות, התחייבויות ומחירים לבדיקה",
];

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

      <div className="grid-2">
        <section className="card">
          <div className="card-head"><h2>נקלט לאחרונה</h2><Link href="/ingest" className="btn btn-sm btn-ghost">להוספה<ArrowLeft size={16} /></Link></div>
          <div className="rows">
            {recent.length === 0 && <p className="muted">עוד לא נקלט כלום. <Link href="/ingest">להעלאה ראשונה</Link></p>}
            {recent.map((r) => (
              <div key={r.id}>
                <KindIcon kind={r.kind} size="sm" />
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
