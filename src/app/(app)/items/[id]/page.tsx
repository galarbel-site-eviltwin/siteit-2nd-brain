import { ArrowRight, DownloadSimple, Trash } from "@phosphor-icons/react/dist/ssr";
import { asc, eq } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteItemAction, updateItemAction } from "../../actions";
import { AssignForm } from "@/components/assign-form";
import { KindIcon, kindLabel } from "@/components/kind-icon";
import { clientOptions } from "@/lib/clients";
import { db } from "@/lib/db";
import { chunks, clients, employees, items } from "@/lib/db/schema";
import { fmtDateTime, isoDay, msToClock } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const SOURCE = { whatsapp: "ייצוא WhatsApp", timeless: "Timeless", upload: "העלאה", manual: "הוזן ידנית", drive: "Google Drive" } as const;

export default async function ItemPage({ params }: PageProps<"/items/[id]">) {
  const me = await requireEmployee();
  const { id } = await params;
  const [row] = await db
    .select({ item: items, clientName: clients.name, byName: employees.name })
    .from(items).leftJoin(clients, eq(clients.id, items.clientId)).leftJoin(employees, eq(employees.id, items.createdBy))
    .where(eq(items.id, id)).limit(1);
  if (!row) notFound();
  const it = row.item;
  const [parts, options] = await Promise.all([db.select().from(chunks).where(eq(chunks.itemId, id)).orderBy(asc(chunks.seq)), clientOptions()]);
  const meta = (it.meta ?? {}) as { messages?: number; segments?: number; mediaFiles?: number };
  const canDelete = it.createdBy === me.id || me.role === "admin";

  return (
    <>
      <Link href={it.clientId && it.assignment === "confirmed" ? `/clients/${it.clientId}?tab=timeline` : "/ingest"} className="back"><ArrowRight size={20} />{it.clientId && it.assignment === "confirmed" ? row.clientName : "קליטת מידע"}</Link>
      <header className="chero">
        <KindIcon kind={it.kind} size="lg" />
        <div>
          <h1 className="item-title">{it.title}</h1>
          <div className="meta">
            <span>{kindLabel(it.kind)}, {SOURCE[it.source]}</span>
            <span>נקלט {fmtDateTime(it.recordedAt)}{row.byName ? ` ע"י ${row.byName}` : ""}</span>
            {meta.messages != null && <span>{meta.messages} הודעות</span>}
            {meta.segments != null && <span>{meta.segments} קטעי דיבור</span>}
            {meta.mediaFiles ? <span>{meta.mediaFiles} קבצי מדיה (עוד לא נקראים)</span> : null}
          </div>
          {it.participants.length > 0 && <div className="tags" style={{ marginTop: 10 }}>{it.participants.slice(0, 12).map((p) => <span key={p} className="tag">{p}</span>)}</div>}
        </div>
        {(it.storagePath || (it.meta as { link?: string } | null)?.link) && <a className="btn btn-ghost btn-sm head-action" href={`/api/items/${id}/file`} target={it.storagePath ? undefined : "_blank"} rel="noreferrer"><DownloadSimple size={18} />{it.storagePath ? "הקובץ המקורי" : "פתיחה ב-Drive"}</a>}
      </header>

      <div className="grid-2 item-grid">
        <section className="card">
          <h2>שיוך ללקוח</h2>
          <p className="small" style={{ marginBottom: 12 }}>
            {it.assignment === "confirmed" && <>שויך ל<b>{row.clientName}</b>. {it.assignmentReason}</>}
            {it.assignment === "suggested" && <>הצעה: <b>{row.clientName}</b>. {it.assignmentReason}. מחכה לאישור.</>}
            {it.assignment === "none" && "לא משויך ללקוח."}
          </p>
          <AssignForm itemId={id} clientId={it.clientId} options={options} suggested={it.assignment === "suggested"} back={`/items/${id}`} />
        </section>
        <section className="card">
          <h2>פרטים</h2>
          <form action={updateItemAction} className="inline-form">
            <input type="hidden" name="itemId" value={id} />
            <label className="sr-only" htmlFor="title">כותרת</label>
            <input id="title" name="title" defaultValue={it.title} />
            <label className="sr-only" htmlFor="occurredAt">מתי זה קרה</label>
            <input id="occurredAt" name="occurredAt" type="date" defaultValue={isoDay(it.occurredAt)} />
            <button className="btn btn-sm btn-ghost">שמירה</button>
          </form>
          <p className="hint">{it.occurredAt ? "התאריך זוהה מתוך הקובץ. אפשר לתקן." : "התאריך לא זוהה מהקובץ. כדאי להזין אותו, כדי שהפריט יופיע במקום הנכון בציר הזמן."}</p>
          {canDelete && (
            <form action={deleteItemAction} style={{ marginTop: 14 }}>
              <input type="hidden" name="itemId" value={id} />
              <button className="btn btn-sm btn-danger"><Trash size={18} />מחיקת הפריט והקובץ</button>
            </form>
          )}
        </section>
      </div>

      <section className="card" style={{ marginTop: 22 }}>
        <h2>מה המוח קרא</h2>
        {it.status === "stored" && <p className="muted">{it.error}</p>}
        {it.status === "failed" && <p className="alert">{it.error}</p>}
        {parts.length > 0 && <p className="muted small" style={{ marginBottom: 14 }}>{parts.length} קטעים. כך המוח יצטט את הפריט בתשובות.</p>}
        <div className="chunks">
          {parts.map((p) => (
            <article key={p.id} className="chunk">
              <span className="chunk-meta">
                {p.startMs != null && <span className="ltr">{msToClock(p.startMs)}</span>}
                {p.at && <span>{fmtDateTime(p.at)}</span>}
                {p.speaker && <b>{p.speaker}</b>}
              </span>
              <p>{p.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
