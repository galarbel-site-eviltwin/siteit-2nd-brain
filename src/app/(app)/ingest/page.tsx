import { ChatsCircle, FileText, Microphone, Waveform } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { AssignForm } from "@/components/assign-form";
import { Dropzone } from "@/components/dropzone";
import { KindIcon } from "@/components/kind-icon";
import { clientOptions, recentItems } from "@/lib/clients";
import { ago, fmtDate } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

export default async function Ingest() {
  await requireEmployee();
  const [rows, options] = await Promise.all([recentItems(60), clientOptions()]);
  const waiting = rows.filter((r) => r.assignment !== "confirmed" && r.status !== "processing" && r.status !== "failed");
  const done = rows.filter((r) => !waiting.includes(r));

  return (
    <>
      <div className="page-head"><h1>קליטת מידע</h1><p>גרור לכאן כל דבר שקשור ללקוח. המוח קורא, מציע לאיזה לקוח זה שייך, ומחכה שתאשר.</p></div>

      <Dropzone />

      <div className="how">
        <article className="card" data-src="wa">
          <span className="sq md" data-src="wa"><ChatsCircle weight="fill" size={22} /></span><h2>שיחת וואטסאפ</h2>
          <ol><li>פותחים את השיחה עם הלקוח</li><li>{"לוחצים על שם השיחה ואז \"ייצוא צ'אט\""}</li><li>{"\"ללא מדיה\" מספיק. גוררים לכאן את הקובץ"}</li></ol>
        </article>
        <article className="card" data-src="meet">
          <span className="sq md" data-src="meet"><Microphone weight="fill" size={22} /></span><h2>פגישה מ-Timeless</h2>
          <ol><li>פותחים את הפגישה ב-Timeless</li><li>מורידים את התמלול (TXT, DOCX או PDF)</li><li>גוררים לכאן. הדוברים והזמנים נשמרים</li></ol>
        </article>
        <article className="card" data-src="doc">
          <span className="sq md" data-src="doc"><FileText weight="fill" size={22} /></span><h2>מסמך או הצעה</h2>
          <ol><li>הצעות מחיר, בריפים ודוחות</li><li>PDF, DOCX או טקסט</li><li>אותו קובץ פעמיים לא ייקלט פעמיים</li></ol>
        </article>
        <article className="card" data-src="dec">
          <span className="sq md" data-src="dec"><Waveform weight="fill" size={22} /></span><h2>הקלטות ותמונות</h2>
          <ol><li>נשמרות כבר עכשיו</li><li>התמלול וקריאת הטקסט מתמונות יגיעו בהמשך</li></ol>
        </article>
      </div>

      <h2 className="sec-title">מחכים לשיוך <span className="tag solid-plum">{waiting.length}</span></h2>
      {waiting.length === 0 ? (
        <p className="muted">אין כרגע פריטים שמחכים לך.</p>
      ) : (
        <div className="q">
          {waiting.map((it) => (
            <article key={it.id} className="card qitem">
              <KindIcon kind={it.kind} />
              <div>
                <Link href={`/items/${it.id}`}><b>{it.title}</b></Link>
                <p className="muted small">{it.occurredAt ? fmtDate(it.occurredAt) : "תאריך לא ידוע"}{it.participants.length ? `, ${it.participants.slice(0, 4).join(", ")}` : ""}. נקלט {ago(it.recordedAt)}</p>
                {it.status === "stored" && <p className="muted small">{it.error}</p>}
                <div className="assign">
                  <p>{it.assignment === "suggested" ? <>נראה ששייך ל<b>{it.clientName}</b>. {it.assignmentReason}.</> : "לא זיהינו לקוח. בחר אחד, או פתח לקוח חדש."}</p>
                  <AssignForm itemId={it.id} clientId={it.clientId} options={options} suggested={it.assignment === "suggested"} />
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      <h2 className="sec-title">נקלטו לאחרונה</h2>
      <div className="rows card">
        {done.length === 0 && <p className="muted">עוד לא נקלט כלום.</p>}
        {done.map((it) => (
          <div key={it.id}>
            <KindIcon kind={it.kind} size="sm" />
            <span><Link href={`/items/${it.id}`}><b>{it.title}</b></Link><span className="sub">{it.status === "failed" ? it.error : it.clientName ? `שויך ל${it.clientName}` : ""}</span></span>
            <span className="sub">{ago(it.recordedAt)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
