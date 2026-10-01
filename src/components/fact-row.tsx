import { Check, CheckCircle, Circle, PencilSimple, X } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { approveFactAction, correctFactAction, rejectFactAction, toggleDoneAction } from "@/app/(app)/review/actions";
import type { facts } from "@/lib/db/schema";
import { EVIDENCE, FACT_KIND, money, STATUS } from "@/lib/facts";
import { fmtDate } from "@/lib/format";

type Fact = typeof facts.$inferSelect;

// One decision, commitment or price, with the words it came from and the way back to the source.
export function FactRow({ f, itemTitle, clientName, review = false, editing = false, editHref }: {
  f: Fact; itemTitle?: string | null; clientName?: string | null; review?: boolean; editing?: boolean; editHref?: string;
}) {
  const d = f.details ?? {};
  const meta = [
    d.amount != null ? money(d.amount, d.currency) : null,
    d.dueDate ? `עד ${fmtDate(new Date(`${d.dueDate}T12:00:00+03:00`))}` : null,
    d.owner ? (d.owner === "us" ? "עלינו" : "על הלקוח") : null,
    d.who,
  ].filter(Boolean).join(" · ");
  const src = `/items/${f.itemId}${f.seqs[0] != null ? `#c${f.seqs[0]}` : ""}`;

  return (
    <article className={`fact ${f.kind} ${f.done ? "is-done" : ""}`}>
      <div className="fact-head">
        <span className="fact-kind">{FACT_KIND[f.kind].label}</span>
        <span className={`fact-ev ${f.evidence}`}>{EVIDENCE[f.evidence]}</span>
        {!review && f.status !== "auto" && <span className="fact-st">{STATUS[f.status]}</span>}
        {clientName && <span className="sub">{clientName}</span>}
      </div>

      {editing ? (
        <form action={correctFactAction} className="fact-edit">
          <input type="hidden" name="id" value={f.id} />
          <textarea name="text" defaultValue={f.text} rows={2} aria-label="הנוסח" />
          <div className="fact-edit-row">
            {(f.kind === "price") && <input name="amount" defaultValue={d.amount ?? ""} placeholder="סכום" aria-label="סכום" className="ltr" />}
            {(f.kind === "deadline" || f.kind === "commitment") && <input name="dueDate" type="date" defaultValue={d.dueDate ?? ""} aria-label="תאריך יעד" />}
            <button className="btn btn-sm btn-primary">שמירת התיקון</button>
            {editHref && <Link href={editHref.replace(/[?&]edit=[^&]+/, "")} className="btn btn-sm btn-ghost">ביטול</Link>}
          </div>
        </form>
      ) : (
        <p className="fact-text">{f.text}{meta && <span className="fact-meta"> · {meta}</span>}</p>
      )}

      {f.quote && <blockquote className="fact-quote">&ldquo;{f.quote}&rdquo;</blockquote>}

      <div className="fact-foot">
        <Link href={src} className="sub">{itemTitle ?? "למקור"}{f.occurredAt ? `, ${fmtDate(f.occurredAt)}` : ""}</Link>
        <span className="fact-actions">
          {f.kind === "commitment" && !review && (
            <form action={toggleDoneAction}><input type="hidden" name="id" value={f.id} /><button className="btn btn-sm btn-ghost">{f.done ? <><CheckCircle size={16} weight="fill" />בוצע</> : <><Circle size={16} />סימון כבוצע</>}</button></form>
          )}
          {review && (
            <>
              <form action={approveFactAction}><input type="hidden" name="id" value={f.id} /><button className="btn btn-sm btn-primary"><Check size={16} />נכון</button></form>
              {editHref && !editing && <Link href={editHref} className="btn btn-sm btn-ghost"><PencilSimple size={16} />תיקון</Link>}
              <form action={rejectFactAction}><input type="hidden" name="id" value={f.id} /><button className="btn btn-sm btn-ghost"><X size={16} />לא נכון</button></form>
            </>
          )}
          {!review && editHref && !editing && <Link href={editHref} className="icon-btn" aria-label="תיקון" title="תיקון"><PencilSimple size={18} /></Link>}
        </span>
      </div>
      {f.history.length > 0 && (() => {
        const prev = f.history[f.history.length - 1];
        const prevMoney = prev.details?.amount != null && prev.details.amount !== d.amount ? `, ${money(prev.details.amount, prev.details.currency)}` : "";
        return <p className="hint">{f.history.length === 1 ? "תוקן פעם אחת" : `תוקן ${f.history.length} פעמים`}. לפני התיקון: &ldquo;{prev.text}{prevMoney}&rdquo; (תוקן ע&quot;י {prev.by})</p>;
      })()}
    </article>
  );
}
