import { ArrowsClockwise, CalendarBlank, EnvelopeSimple, LockSimple, PlugsConnected } from "@phosphor-icons/react/dist/ssr";
import { and, count, eq, gte } from "drizzle-orm";
import Link from "next/link";
import { disconnectMineAction, syncMineAction } from "./actions";
import { PendingButton } from "@/components/pending-button";
import { msConfigured } from "@/lib/accounts/microsoft";
import { db } from "@/lib/db";
import { accounts, events, items, mailThreads } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const ERRORS: Record<string, string> = {
  denied: "החיבור בוטל בחלון ההתחברות.",
  scope: "צריך לאשר גם קריאת מיילים וגם קריאת יומן. אפשר לנסות שוב ולסמן את שתיהן.",
  refresh: "לא התקבלה הרשאה קבועה. אפשר לנסות שוב.",
  other_account: "התחברת עם חשבון אחר. צריך להתחבר עם המייל של העבודה שלך.",
  exchange: "משהו נכשל בחיבור. אפשר לנסות שוב.",
  ms_setup: "החיבור ל-Microsoft עוד לא הוגדר בצד של החברה.",
};

type Account = typeof accounts.$inferSelect;
type Result = { mail?: { added?: number; updated?: number; more?: boolean; note?: string }; cal?: { events?: number; error?: string } };

const PROVIDERS = {
  google: { title: "Gmail ו-Google Calendar", icons: ["/brand/icons/gmail.png", "/brand/icons/gcal.png"], start: "/api/connect/google/start" },
  microsoft: { title: "Outlook ויומן Microsoft", icons: ["/brand/icons/outlook.png"], start: "/api/connect/microsoft/start" },
} as const;

async function stats(acc: Account) {
  const [[threads], [upcoming]] = await Promise.all([
    db.select({ n: count() }).from(mailThreads).innerJoin(items, eq(items.id, mailThreads.itemId)).where(eq(mailThreads.accountId, acc.id)),
    db.select({ n: count() }).from(events).where(and(eq(events.accountId, acc.id), gte(events.startAt, new Date()))),
  ]);
  return { threads: threads.n, upcoming: upcoming.n };
}

async function AccountCard({ provider, acc, ready }: { provider: keyof typeof PROVIDERS; acc: Account | undefined; ready: boolean }) {
  const p = PROVIDERS[provider];
  const s = acc ? await stats(acc) : null;
  const r = (acc?.lastResult ?? {}) as Result;
  return (
    <section className="card conn">
      <div className="conn-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- static brand icons */}
        <span className="conn-ics">{p.icons.map((i) => <img key={i} src={i} alt="" width={36} height={36} />)}</span>
        <div><h2>{p.title}</h2><span className="muted small">{acc ? `מחובר: ${acc.email}` : ready ? "לא מחובר" : "מחכה להגדרה"}</span></div>
      </div>
      {acc && s ? (
        <>
          <div className="conn-stats">
            <span><EnvelopeSimple size={18} /><b>{s.threads}</b> שרשורי מייל עם לקוחות</span>
            <span><CalendarBlank size={18} /><b>{s.upcoming}</b> פגישות קרובות</span>
          </div>
          <p className="muted small">
            {acc.lastSyncAt ? `סונכרן ${ago(acc.lastSyncAt)}. ` : ""}
            {r.mail?.more ? "עוד קורא את ההיסטוריה, וזה ממשיך לבד כל רבע שעה. " : ""}
            {r.mail?.note ? `${r.mail.note}. ` : ""}
            {acc.lastError ? <span className="alert-inline">שגיאה אחרונה: {acc.lastError}</span> : null}
          </p>
          <div className="conn-actions">
            <form action={syncMineAction}><input type="hidden" name="provider" value={provider} /><PendingButton pending="מסנכרן..."><ArrowsClockwise size={16} />סנכרון עכשיו</PendingButton></form>
            <form action={disconnectMineAction}><input type="hidden" name="provider" value={provider} /><button className="btn btn-sm btn-ghost">ניתוק</button></form>
          </div>
        </>
      ) : ready ? (
        <>
          <ul className="conn-list">
            <li>מיילים עם דומיין של לקוח או עם איש קשר שלו נכנסים לציר הזמן של הלקוח</li>
            <li>פגישות מהיומן מופיעות ב&quot;היום שלי&quot; ובעמוד הלקוח</li>
            <li>קריאה בלבד: המוח לא שולח מיילים ולא משנה את היומן</li>
          </ul>
          <a className="btn btn-primary" href={p.start}><PlugsConnected size={18} />חיבור החשבון שלי</a>
        </>
      ) : (
        <p className="muted">צריך לרשום את המוח כאפליקציה בחשבון Microsoft של החברה. אחרי זה כל עובד יוכל לחבר כאן את ה-Outlook שלו.</p>
      )}
    </section>
  );
}

export default async function Connections({ searchParams }: PageProps<"/connections">) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const mine = await db.select().from(accounts).where(eq(accounts.employeeId, me.id));
  const [{ n: team }] = await db.select({ n: count() }).from(accounts);
  const err = typeof sp.error === "string" ? ERRORS[sp.error] ?? sp.error : null;

  return (
    <>
      <div className="page-head"><h1>חיבורים</h1><p>כל עובד מחבר את המייל והיומן שלו. המוח קורא רק מיילים עם לקוחות שהוא מכיר, ורק פגישות שיש בהן עוד אנשים.</p></div>
      {err && <p className="alert" role="alert">{err}</p>}
      {(sp.connected === "google" || sp.connected === "microsoft") && <p className="note" role="status">החיבור הצליח. המוח מתחיל לקרוא את המיילים עם הלקוחות מ-12 החודשים האחרונים, וזה ממשיך ברקע.</p>}

      <div className="grid-2">
        <AccountCard provider="google" acc={mine.find((a) => a.provider === "google")} ready />
        <AccountCard provider="microsoft" acc={mine.find((a) => a.provider === "microsoft")} ready={msConfigured()} />
        <section className="card conn span-2">
          <div className="conn-head"><span className="conn-ics"><LockSimple size={28} /></span><div><h2>מה נשאר פרטי</h2></div></div>
          <p className="muted">מיילים בלי לקוח (פנימיים, אישיים, ספקים) לא נקראים בכלל, גם לא הנושא שלהם. כדי שמיילים של לקוח ייכנסו, צריך שיהיה לו דומיין או איש קשר עם מייל בעמוד הלקוח. אותה שיחה שמגיעה גם מ-Gmail וגם מ-Outlook, או משני עובדים, נשמרת פעם אחת.{team > 0 ? ` כרגע ${team} חשבונות מחוברים בצוות.` : ""} <Link href="/clients">ללקוחות</Link></p>
        </section>
      </div>
    </>
  );
}
