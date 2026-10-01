import { ArrowRight, Globe, PencilSimple, Phone, Plus, Tag, Trash, User } from "@phosphor-icons/react/dist/ssr";
import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { notFound } from "next/navigation";
import { addAliasAction, addContactAction, removeAliasAction, removeContactAction, summarizeClientAction } from "../../actions";
import { ClientMark } from "@/components/client-mark";
import { ClientSummaryView } from "@/components/summary-view";
import { Dropzone } from "@/components/dropzone";
import { KindIcon, kindLabel } from "@/components/kind-icon";
import { SERVICES, STATUS, type Service } from "@/lib/clients";
import { db } from "@/lib/db";
import { clientAliases, clients, contacts, employees, items } from "@/lib/db/schema";
import { ago, fmtDate } from "@/lib/format";
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

  const [aliases, people, timeline] = await Promise.all([
    db.select().from(clientAliases).where(eq(clientAliases.clientId, id)).orderBy(asc(clientAliases.kind)),
    db.select().from(contacts).where(eq(contacts.clientId, id)).orderBy(asc(contacts.name)),
    db.select().from(items).where(eq(items.clientId, id)).orderBy(desc(sql`coalesce(${items.occurredAt}, ${items.recordedAt})`)).limit(200),
  ]);
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
            {aliases.find((a) => a.kind === "domain") && <span className="ltr">{aliases.find((a) => a.kind === "domain")!.value}</span>}
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
