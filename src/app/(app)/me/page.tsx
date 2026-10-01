import { LockSimple, PencilSimple, Plus, PushPin, PushPinSlash, Trash } from "@phosphor-icons/react/dist/ssr";
import { and, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { addNoteAction, deleteNoteAction, togglePinAction, updateNoteAction } from "./actions";
import { KindIcon } from "@/components/kind-icon";
import { clientOptions } from "@/lib/clients";
import { db } from "@/lib/db";
import { accounts, clients, items, notes } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

function ClientSelect({ value, options }: { value?: string | null; options: { id: string; name: string }[] }) {
  return (
    <select name="clientId" defaultValue={value ?? ""} aria-label="לקוח קשור">
      <option value="">בלי לקוח</option>
      {options.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
    </select>
  );
}

export default async function Me({ searchParams }: PageProps<"/me">) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const editing = typeof sp.edit === "string" ? sp.edit : null;
  const [list, options, uploads, conns] = await Promise.all([
    db.select({ n: notes, clientName: clients.name }).from(notes).leftJoin(clients, eq(clients.id, notes.clientId))
      .where(eq(notes.employeeId, me.id)).orderBy(desc(notes.pinned), desc(notes.updatedAt)).limit(200),
    clientOptions(),
    db.select({ id: items.id, title: items.title, kind: items.kind, source: items.source, recordedAt: items.recordedAt, clientName: clients.name })
      .from(items).leftJoin(clients, eq(clients.id, items.clientId))
      .where(and(eq(items.createdBy, me.id))).orderBy(desc(items.recordedAt)).limit(8),
    db.select({ provider: accounts.provider, email: accounts.email }).from(accounts).where(eq(accounts.employeeId, me.id)),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>האזור שלי</h1>
        <p className="private-line"><LockSimple size={18} weight="bold" />ההערות כאן גלויות רק לך. אף עובד אחר לא רואה אותן, והמוח לא משתמש בהן בתשובות.</p>
      </div>

      <div className="grid-2 me-grid">
        <section className="card span-2">
          <h2>הערות</h2>
          <form action={addNoteAction} className="note-new">
            <textarea name="body" required rows={3} placeholder="מחשבה, תזכורת או משהו לבדוק..." aria-label="הערה חדשה" />
            <div className="note-new-row"><ClientSelect options={options} /><button className="btn btn-sm btn-primary"><Plus size={16} />שמירה</button></div>
          </form>

          {list.length === 0 ? (
            <p className="muted">עוד אין הערות.</p>
          ) : (
            <div className="notes">
              {list.map(({ n, clientName }) =>
                editing === n.id ? (
                  <form key={n.id} action={updateNoteAction} className={`pnote editing ${n.pinned ? "pinned" : ""}`}>
                    <input type="hidden" name="id" value={n.id} />
                    <textarea name="body" required rows={4} defaultValue={n.body} aria-label="עריכת הערה" autoFocus />
                    <div className="note-new-row"><ClientSelect value={n.clientId} options={options} /><button className="btn btn-sm btn-primary">שמירה</button><Link href="/me" className="btn btn-sm btn-ghost">ביטול</Link></div>
                  </form>
                ) : (
                  <article key={n.id} className={`pnote ${n.pinned ? "pinned" : ""}`}>
                    <p>{n.body}</p>
                    <div className="pnote-foot">
                      <span className="sub">{clientName ? <Link href={`/clients/${n.clientId}`}>{clientName}</Link> : null}{clientName ? " · " : ""}{ago(n.updatedAt)}</span>
                      <span className="pnote-actions">
                        <form action={togglePinAction}><input type="hidden" name="id" value={n.id} /><input type="hidden" name="pinned" value={n.pinned ? "0" : "1"} /><button className="icon-btn" aria-label={n.pinned ? "ביטול הצמדה" : "הצמדה למעלה"} title={n.pinned ? "ביטול הצמדה" : "הצמדה למעלה"}>{n.pinned ? <PushPinSlash size={18} /> : <PushPin size={18} />}</button></form>
                        <Link href={`/me?edit=${n.id}`} className="icon-btn" aria-label="עריכה" title="עריכה"><PencilSimple size={18} /></Link>
                        <form action={deleteNoteAction}><input type="hidden" name="id" value={n.id} /><button className="icon-btn" aria-label="מחיקה" title="מחיקה"><Trash size={18} /></button></form>
                      </span>
                    </div>
                  </article>
                ),
              )}
            </div>
          )}
        </section>

        <section className="card">
          <h2>מה העליתי לאחרונה</h2>
          <div className="rows">
            {uploads.length === 0 && <p className="muted">עוד לא העלית כלום. <Link href="/ingest">לקליטת מידע</Link></p>}
            {uploads.map((u) => (
              <div key={u.id}>
                <KindIcon kind={u.kind} source={u.source} size="sm" />
                <span><Link href={`/items/${u.id}`}><b>{u.title}</b></Link><span className="sub">{u.clientName ?? "לא משויך"}</span></span>
                <span className="sub">{ago(u.recordedAt)}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="card">
          <h2>החשבונות שלי</h2>
          <p className="muted small" style={{ marginBottom: 10 }}>{me.email}</p>
          {conns.length === 0 ? (
            <p className="muted">המייל והיומן שלך לא מחוברים. <Link href="/connections">לחיבור</Link></p>
          ) : (
            conns.map((c) => <p key={c.provider} className="check">{c.provider === "google" ? "Gmail ויומן Google" : "Outlook ויומן Microsoft"}: <span className="ltr">{c.email}</span></p>)
          )}
          <Link href="/connections" className="btn btn-sm btn-ghost" style={{ marginTop: 8 }}>ניהול חיבורים</Link>
        </section>
      </div>
    </>
  );
}
