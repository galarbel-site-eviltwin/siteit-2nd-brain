import { ArrowRight, Globe, PencilSimple, Phone, Plus, Tag, Trash, User } from "@phosphor-icons/react/dist/ssr";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addAliasAction, addContactAction, removeAliasAction, removeContactAction, summarizeClientAction } from "../../actions";
import { ClientMark } from "@/components/client-mark";
import { ClientSummaryView } from "@/components/summary-view";
import { Dropzone } from "@/components/dropzone";
import { KindIcon, kindLabel } from "@/components/kind-icon";
import { SERVICES, STATUS, type Service } from "@/lib/clients";
import { db } from "@/lib/db";
import { clientAliases, clients, contacts, employees, events, facts, items } from "@/lib/db/schema";
import { FactRow } from "@/components/fact-row";
import { TRUSTED } from "@/lib/facts";
import { ago, fmtDate, fmtDateTime } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const ALIAS_LABEL = { name: "שם", domain: "דומיין", nickname: "כינוי", phone: "טלפון" } as const;
const errors: Record<string, string> = {
  alias: "הערך הזה כבר משויך ללקוח אחר.",
  alias_short: "הערך קצר מדי.",
  contact: "לאיש קשר צריך שם.",
  ai: "המוח לא הצליח לבנות תמונת מצב כרגע. אפשר לנסות שוב בעוד רגע.",
};

export default async function ClientSpace({ params, searchParams }: PageProps<"/clients/[id]">) {
  await requireEmployee();
  const { id } = await params;
  const sp = await searchParams;
  const tab = sp.tab === "timeline" ? "timeline" : "overview";
  const [c] = await db.select({ client: clients, ownerName: employees.name }).from(clients).leftJoin(employees, eq(employees.id, clients.ownerId)).where(eq(clients.id, id)).limit(1);
  if (!c) notFound();
  const client = c.client;

  const [aliases, people, timeline, meetingRows, factRows] = await Promise.all([
    db.select().from(clientAliases).where(eq(clientAliases.clientId, id)).orderBy(asc(clientAliases.kind)),
    db.select().from(contacts).where(eq(contacts.clientId, id)).orderBy(asc(contacts.name)),
    db.select().from(items).where(eq(items.clientId, id)).orderBy(desc(sql`coalesce(${items.occurredAt}, ${items.recordedAt})`)).limit(200),
    db.select({ id: events.id, title: events.title, startAt: events.startAt, ahead: sql<boolean>`${events.startAt} >= now()` }).from(events).where(eq(events.clientId, id)).orderBy(desc(events.startAt)).limit(60),
    db.select({ f: facts, itemTitle: items.title }).from(facts).innerJoin(items, eq(items.id, facts.itemId))
      .where(and(eq(facts.clientId, id), inArray(facts.status, [...TRUSTED]))).orderBy(desc(facts.occurredAt)).limit(60),
  ]);
  const editFact = typeof sp.edit === "string" ? sp.edit : null;
  const openCommitments = factRows.filter((r) => r.f.kind === "commitment" && !r.f.done);
  const otherFacts = factRows.filter((r) => r.f.kind !== "commitment").slice(0, 12);
  // The same meeting sits in several people's calendars: show it once.
  const seen = new Set<string>();
  const meetings = meetingRows.filter((m) => { const k = `${m.title.trim().toLowerCase()}|${m.startAt.getTime()}`; if (seen.has(k)) return false; seen.add(k); return true; });
  const upcoming = meetings.filter((m) => m.ahead).reverse().slice(0, 5);
  const past = meetings.filter((m) => !m.ahead).slice(0, 5);
  const confirmed = timeline.filter((i) => i.assignment === "confirmed");
  const suggested = timeline.filter((i) => i.assignment === "suggested");
  const error = typeof sp.error === "string" ? errors[sp.error] : null;

  return (
    <>
      <Link href="/clients" className="back"><ArrowRight size={20} />כל הלקוחות</Link>
      <header className="chero">
        <ClientMark id={client.id} name={client.name} domain={aliases.find((a) => a.kind === "domain")?.value} size={72} />
        <div>
          <h1>{client.name}</h1>
          <div className="meta">
            {aliases.find((a) => a.kind === "domain") ? <span className="ltr">{aliases.find((a) => a.kind === "domain")!.value}</span> : (
              // No site yet: one field here, so the logo, the mail and the matching all start working.
              <form action={addAliasAction} className="add-site">
                <input type="hidden" name="clientId" value={id} /><input type="hidden" name="kind" value="domain" />
                <input name="value" required placeholder="האתר של הלקוח, למשל example.co.il" aria-label="האתר של הלקוח" className="ltr" />
                <button className="btn btn-sm btn-primary">שמירה</button>
              </form>
            )}
            <span><User size={18} />אחראי: {c.ownerName ?? "לא נקבע"}</span>
            <span>{confirmed.length} פריטים{confirmed[0] ? `, עודכן ${ago(confirmed[0].recordedAt)}` : ""}</span>
            {client.status !== "active" && <span className="tag outline">{STATUS[client.status]}</span>}
          </div>
          <div className="tags" style={{ marginTop: 10 }}>{(client.services as Service[]).map((s) => <span key={s} className="tag">{SERVICES[s]}</span>)}</div>
        </div>
        <Link href={`/clients/${id}/edit`} className="btn btn-ghost btn-sm head-action"><PencilSimple size={18} />עריכה</Link>
      </header>

      <nav className="tabs" aria-label="מרחב הלקוח">
        <Link href={`/clients/${id}`} aria-current={tab === "overview" ? "page" : undefined}>סקירה</Link>
        <Link href={`/clients/${id}?tab=timeline`} aria-current={tab === "timeline" ? "page" : undefined}>ציר זמן <span className="count">{confirmed.length}</span></Link>
      </nav>

      {error && <p className="alert" role="alert">{error}</p>}

      {tab === "overview" ? (
        <div className="grid-2">
          <div className="span-2"><ClientSummaryView summary={client.summary} at={client.summarizedAt} clientId={id} action={summarizeClientAction} /></div>
          <section className="card">
            <h2>אנשי קשר</h2>
            <div className="rows">
              {people.length === 0 && <p className="muted">עוד אין אנשי קשר. שם וטלפון עוזרים למוח לזהות שיחות של הלקוח.</p>}
              {people.map((p) => (
                <div key={p.id}>
                  <span className="av soft">{p.name.trim()[0]}</span>
                  <span><b>{p.name}</b><span className="sub">{[p.role, p.email, p.phone].filter(Boolean).join(" · ")}</span></span>
                  <form action={removeContactAction}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="clientId" value={id} /><button className="icon-btn" aria-label={`הסרת ${p.name}`}><Trash size={18} /></button></form>
                </div>
              ))}
            </div>
            <form action={addContactAction} className="inline-form">
              <input type="hidden" name="clientId" value={id} />
              <input name="name" required placeholder="שם" aria-label="שם איש קשר" />
              <input name="role" placeholder="תפקיד" aria-label="תפקיד" />
              <input name="phone" placeholder="טלפון" aria-label="טלפון" className="ltr" />
              <input name="email" type="email" placeholder="מייל" aria-label="מייל" className="ltr" />
              <button className="btn btn-sm btn-ghost"><Plus size={18} />הוספה</button>
            </form>
          </section>

          <section className="card">
            <h2>איך המוח מזהה את הלקוח</h2>
            <p className="muted small">כשמגיע קובץ, המוח מחפש בו את הערכים האלה ומציע לשייך אותו לכאן. את השיוך תמיד מאשר אדם.</p>
            <div className="alias-list">
              {aliases.map((a) => (
                <span key={a.id} className="alias">
                  {a.kind === "domain" ? <Globe size={16} /> : a.kind === "phone" ? <Phone size={16} /> : <Tag size={16} />}
                  <span className="k">{ALIAS_LABEL[a.kind]}</span><span className={a.kind === "name" ? "" : "ltr"}>{a.value}</span>
                  {a.kind !== "name" && (
                    <form action={removeAliasAction}><input type="hidden" name="id" value={a.id} /><input type="hidden" name="clientId" value={id} /><button aria-label={`הסרת ${a.value}`}>×</button></form>
                  )}
                </span>
              ))}
            </div>
            <form action={addAliasAction} className="inline-form">
              <input type="hidden" name="clientId" value={id} />
              <select name="kind" aria-label="סוג"><option value="domain">דומיין</option><option value="nickname">שם נוסף</option><option value="phone">טלפון</option></select>
              <input name="value" required placeholder="ערך" aria-label="ערך" />
              <button className="btn btn-sm btn-ghost"><Plus size={18} />הוספה</button>
            </form>
            {client.notes && <><h2 style={{ marginTop: 22 }}>הערות</h2><p style={{ whiteSpace: "pre-wrap" }}>{client.notes}</p></>}
          </section>

          {factRows.length > 0 && (
            <section className="card span-2">
              <h2>החלטות, התחייבויות ומחירים</h2>
              {openCommitments.length > 0 && <><h3 className="muted small">התחייבויות פתוחות</h3><div className="facts">{openCommitments.map(({ f, itemTitle }) => <FactRow key={f.id} f={f} itemTitle={itemTitle} editing={editFact === f.id} editHref={`/clients/${id}?edit=${f.id}`} />)}</div></>}
              {otherFacts.length > 0 && <><h3 className="muted small" style={{ marginTop: 14 }}>החלטות, מחירים ובקשות</h3><div className="facts">{otherFacts.map(({ f, itemTitle }) => <FactRow key={f.id} f={f} itemTitle={itemTitle} editing={editFact === f.id} editHref={`/clients/${id}?edit=${f.id}`} />)}</div></>}
            </section>
          )}

          {meetings.length > 0 && (
            <section className="card span-2">
              <h2>פגישות</h2>
              <div className="grid-2 tight">
                <div><h3 className="muted small">קרובות</h3>{upcoming.length ? upcoming.map((m) => <Link key={m.id} href={`/meetings/${m.id}`} className="meet-line"><b>{m.title}</b><span className="sub">{fmtDateTime(m.startAt)} · תדריך</span></Link>) : <p className="muted small">אין פגישות קרובות ביומן.</p>}</div>
                <div><h3 className="muted small">אחרונות</h3>{past.length ? past.map((m) => <Link key={m.id} href={`/meetings/${m.id}`} className="meet-line"><b>{m.title}</b><span className="sub">{fmtDateTime(m.startAt)}</span></Link>) : <p className="muted small">אין פגישות בחודשיים האחרונים.</p>}</div>
              </div>
            </section>
          )}

          <section className="card span-2">
            <h2>הוספת ידע ללקוח</h2>
            <Dropzone clientId={id} compact />
          </section>
        </div>
      ) : (
        <>
          {suggested.length > 0 && (
            <p className="note">יש {suggested.length} פריטים שהמוח חושב ששייכים ללקוח הזה, ומחכים לאישור. <Link href="/ingest">לאישור בקליטת מידע</Link></p>
          )}
          {confirmed.length === 0 ? (
            <div className="empty"><b>ציר הזמן ריק</b><p className="muted">העלה שיחת וואטסאפ, תמלול פגישה או מסמך של הלקוח, והם יופיעו כאן לפי התאריך שבו קרו.</p><Link className="btn btn-primary" href={`/clients/${id}`}>להעלאה</Link></div>
          ) : (
            <ol className="tl">
              {confirmed.map((it) => (
                <li key={it.id}>
                  <KindIcon kind={it.kind} source={it.source} />
                  <Link href={`/items/${it.id}`} className="card tl-card">
                    <span className="when">{it.occurredAt ? fmtDate(it.occurredAt) : `נקלט ${fmtDate(it.recordedAt)}, תאריך לא ידוע`}</span>
                    <b>{it.title}</b>
                    <span className="muted small">{kindLabel(it.kind, it.source)}{it.participants.length ? `, ${it.participants.slice(0, 4).join(", ")}` : ""}{it.status === "stored" ? ". נשמר, עוד לא נקרא" : ""}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </>
  );
}
