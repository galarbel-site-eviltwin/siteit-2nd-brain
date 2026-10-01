import { ArrowsClockwise, Sparkle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ClientSummary, ItemSummary, Point } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { PendingButton } from "./pending-button";

// A ref is a way back to the source: a piece on this page (#c3), or a whole item for client summaries.
function Refs({ p, itemHref }: { p: Point; itemHref?: (id: string) => string }) {
  if (!p.refs.length) return null;
  return (
    <span className="refs">
      {p.refs.slice(0, 4).map((r, i) =>
        r.item && itemHref
          ? <Link key={i} href={itemHref(r.item)} className="ref" title="פתיחת המקור">{i + 1}</Link>
          : <a key={i} href={`#c${r.seq}`} className="ref" title="מעבר לקטע">{i + 1}</a>,
      )}
    </span>
  );
}

function List({ title, points, tone, itemHref }: { title: string; points: Point[]; tone?: "ok" | "open" | "warn"; itemHref?: (id: string) => string }) {
  if (!points.length) return null;
  return (
    <div className={`sum-block ${tone ?? ""}`}>
      <h3>{title}</h3>
      <ul>{points.map((p, i) => <li key={i}>{p.text}<Refs p={p} itemHref={itemHref} /></li>)}</ul>
    </div>
  );
}

function Shell({ title, at, empty, action, hidden, children }: { title: string; at: Date | null; empty: string; action: (f: FormData) => Promise<void>; hidden: Record<string, string>; children?: React.ReactNode }) {
  return (
    <section className="card summary">
      <div className="sum-head">
        <h2><Sparkle weight="fill" size={20} className="sum-ic" />{title}</h2>
        <form action={action}>
          {Object.entries(hidden).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
          <PendingButton pending="המוח קורא...">{at ? <><ArrowsClockwise size={16} />רענון</> : <><Sparkle size={16} />יצירת סיכום</>}</PendingButton>
        </form>
      </div>
      {children ?? <p className="muted">{empty}</p>}
      {at && children && <p className="hint">נכתב ע&quot;י המוח {ago(at)}. כל נקודה מפנה למקור שלה, כדאי לבדוק לפני שמסתמכים.</p>}
    </section>
  );
}

export function ItemSummaryView({ summary, at, itemId, action }: { summary: ItemSummary | null; at: Date | null; itemId: string; action: (f: FormData) => Promise<void> }) {
  return (
    <Shell title="ניתוח המוח" at={at} action={action} hidden={{ itemId }} empty="עוד אין ניתוח לפריט הזה. הוא נוצר לבד אחרי ההעלאה, ואפשר גם ליצור אותו עכשיו.">
      {summary && (
        <>
          <p className="sum-about">{summary.about}</p>
          {summary.mood && <p className="sum-mood"><b>תחושת הלקוח:</b> {summary.mood.text}<Refs p={summary.mood} /></p>}
          <div className="sum-grid">
            <List title="עיקרי הדברים" points={summary.points} />
            <List title="מה סוכם" points={summary.agreed} tone="ok" />
            <List title="מה פתוח" points={summary.open} tone="open" />
          </div>
        </>
      )}
    </Shell>
  );
}

export function ClientSummaryView({ summary, at, clientId, action }: { summary: ClientSummary | null; at: Date | null; clientId: string; action: (f: FormData) => Promise<void> }) {
  const itemHref = (id: string) => `/items/${id}`;
  return (
    <Shell title="תמונת מצב" at={at} action={action} hidden={{ clientId }} empty="עוד אין תמונת מצב. היא נבנית מהשיחות, הפגישות והמסמכים של הלקוח.">
      {summary && (
        <>
          <p className="sum-about">{summary.overview}</p>
          <div className="sum-grid">
            <List title="מה קורה עכשיו" points={summary.now} itemHref={itemHref} />
            <List title="מה פתוח מולו" points={summary.open} tone="open" itemHref={itemHref} />
            <List title="לשים לב" points={summary.watch} tone="warn" itemHref={itemHref} />
          </div>
          <p className="muted small">מבוסס על {summary.basedOn} פריטים.</p>
        </>
      )}
    </Shell>
  );
}
