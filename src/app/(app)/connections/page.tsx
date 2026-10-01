import { ArrowsClockwise, CalendarBlank, EnvelopeSimple, LockSimple, PlugsConnected } from "@phosphor-icons/react/dist/ssr";
import { and, count, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { disconnectMineAction, syncMineAction } from "./actions";
import { PendingButton } from "@/components/pending-button";
import { googleAccountFor } from "@/lib/accounts/google";
import { db } from "@/lib/db";
import { accounts, events, items, mailThreads } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const ERRORS: Record<string, string> = {
  denied: "החיבור בוטל בחלון של Google.",
  scope: "צריך לאשר גם קריאת מיילים וגם קריאת יומן. אפשר לנסות שוב ולסמן את שתיהן.",
  refresh: "Google לא החזיר הרשאה קבועה. אפשר לנסות שוב.",
  other_account: "התחברת עם חשבון אחר. צריך להתחבר עם המייל של העבודה שלך.",
  exchange: "משהו נכשל בחיבור. אפשר לנסות שוב.",
};

type Result = { mail?: { added?: number; updated?: number; more?: boolean; note?: string }; cal?: { events?: number; error?: string } };

export default async function Connections({ searchParams }: PageProps<"/connections">) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const acc = await googleAccountFor(me.id);
  const [[threads], [upcoming]] = acc
    ? await Promise.all([
        db.select({ n: count() }).from(mailThreads).innerJoin(items, eq(items.id, mailThreads.itemId)).where(eq(mailThreads.accountId, acc.id)),
        db.select({ n: count() }).from(events).where(and(eq(events.accountId, acc.id), gte(events.startAt, new Date()))),
      ])
    : [[{ n: 0 }], [{ n: 0 }]];
  const [{ n: team }] = await db.select({ n: count() }).from(accounts);
  const r = (acc?.lastResult ?? {}) as Result;
  const err = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;

  return (
    <>
      <div className="page-head"><h1>חיבורים</h1><p>כל עובד מחבר את המייל והיומן שלו. המוח קורא רק מיילים עם לקוחות שהוא מכיר, ורק פגישות שיש בהן עוד אנשים.</p></div>
      {err && <p className="alert" role="alert">{err}</p>}
      {sp.connected === "google" && <p className="note" role="status">החיבור הצליח. המוח מתחיל לקרוא את המיילים עם הלקוחות מ-12 החודשים האחרונים, וזה ממשיך ברקע.</p>}

      <div className="grid-2">
        <section className="card conn">
          <div className="conn-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand icons */}
            <span className="conn-ics"><img src="/brand/icons/gmail.png" alt="" width={36} height={36} /><img src="/brand/icons/gcal.png" alt="" width={36} height={36} /></span>
            <div><h2>Gmail ו-Google Calendar</h2><span className="muted small">{acc ? `מחובר: ${acc.email}` : "לא מחובר"}</span></div>
          </div>
          {acc ? (
            <>
              <div className="conn-stats">
                <span><EnvelopeSimple size={18} /><b>{threads.n}</b> שרשורי מייל עם לקוחות</span>
                <span><CalendarBlank size={18} /><b>{upcoming.n}</b> פגישות קרובות</span>
              </div>
              <p className="muted small">
                {acc.lastSyncAt ? `סונכרן ${ago(acc.lastSyncAt)}. ` : ""}
                {r.mail?.more ? "עוד קורא את ההיסטוריה, וזה ממשיך לבד כל רבע שעה. " : ""}
                {r.mail?.note ? `${r.mail.note}. ` : ""}
                {acc.lastError ? <span className="alert-inline">שגיאה אחרונה: {acc.lastError}</span> : null}
              </p>
              <div className="conn-actions">
                <form action={syncMineAction}><PendingButton pending="מסנכרן..."><ArrowsClockwise size={16} />סנכרון עכשיו</PendingButton></form>
                <form action={disconnectMineAction}><input type="hidden" name="provider" value="google" /><button className="btn btn-sm btn-ghost">ניתוק</button></form>
              </div>
            </>
          ) : (
            <>
              <ul className="conn-list">
                <li>מיילים עם דומיין של לקוח או עם איש קשר שלו נכנסים לציר הזמן של הלקוח</li>
                <li>פגישות מהיומן מופיעות ב&quot;היום שלי&quot; ובעמוד הלקוח</li>
                <li>קריאה בלבד: המוח לא שולח מיילים ולא משנה את היומן</li>
              </ul>
              <a className="btn btn-primary" href="/api/connect/google/start"><PlugsConnected size={18} />חיבור החשבון שלי</a>
            </>
          )}
        </section>

        <section className="card conn">
          <div className="conn-head">
            {/* eslint-disable-next-line @next/next/no-img-element -- static brand icon */}
            <span className="conn-ics"><img src="/brand/icons/outlook.png" alt="" width={36} height={36} /></span>
            <div><h2>Outlook ויומן Microsoft</h2><span className="muted small">בקרוב</span></div>
          </div>
          <p className="muted">החיבור ל-Microsoft מחכה להרשמה של אפליקציה בחשבון Microsoft של החברה.</p>
        </section>

        <section className="card conn span-2">
          <div className="conn-head"><span className="conn-ics"><LockSimple size={28} /></span><div><h2>מה נשאר פרטי</h2></div></div>
          <p className="muted">מיילים בלי לקוח (פנימיים, אישיים, ספקים) לא נקראים בכלל, גם לא הנושא שלהם. כדי שמיילים של לקוח ייכנסו, צריך שיהיה לו דומיין או איש קשר עם מייל בעמוד הלקוח.{team > 0 ? ` כרגע ${team} חשבונות מחוברים בצוות.` : ""} <Link href="/clients">ללקוחות</Link></p>
        </section>
      </div>
    </>
  );
}
