import { GoogleDriveLogo } from "@phosphor-icons/react/dist/ssr";
import { count, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { AssignForm } from "@/components/assign-form";
import { Dropzone } from "@/components/dropzone";
import { KindIcon } from "@/components/kind-icon";
import { clientOptions, recentItems } from "@/lib/clients";
import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { getConnection, type DriveConfig } from "@/lib/drive/google";
import { ago, fmtDate } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

export default async function Ingest() {
  await requireEmployee();
  const [rows, options, conn, [{ n: newFolders }]] = await Promise.all([
    recentItems(60), clientOptions(), getConnection(),
    db.select({ n: count() }).from(driveFolders).where(eq(driveFolders.status, "pending")),
  ]);
  const root = (conn?.config as DriveConfig | null)?.rootName;
  const waiting = rows.filter((r) => r.assignment !== "confirmed" && r.status !== "processing" && r.status !== "failed");
  const done = rows.filter((r) => !waiting.includes(r));

  return (
    <>
      <div className="page-head"><h1>קליטת מידע</h1><p>גרור לכאן כל דבר שקשור ללקוח. המוח קורא, מציע לאיזה לקוח זה שייך, ומחכה שתאשר.</p></div>

      <Dropzone />

      <Link href="/ingest/drive" className="card drive-card">
        <span className="sq lg" data-src="media"><GoogleDriveLogo weight="fill" size={30} /></span>
        <div>
          <b>{root ? `Google Drive: ${root}` : "חיבור Google Drive"}</b>
          <span className="muted small">{root ? (newFolders ? `${newFolders} תיקיות חדשות מחכות לקישור ללקוח` : "קבצים מתיקיות הלקוחות נקלטים לבד") : "המוח יקלוט לבד קבצים מתיקיות הלקוחות ב-Drive המשותף"}</span>
        </div>
        <span className="btn btn-sm btn-ghost">{root ? "הגדרות" : "חיבור"}</span>
      </Link>

      <div className="how">
        <article className="card" data-src="wa">
          <Image className="how-ic" src="/brand/icons/whatsapp.webp" alt="" width={56} height={56} /><h2>שיחת וואטסאפ</h2>
          <ol><li>פותחים את השיחה עם הלקוח</li><li>{"לוחצים על שם השיחה ואז \"ייצוא צ'אט\""}</li><li>{"\"ללא מדיה\" מספיק. גוררים לכאן את הקובץ"}</li></ol>
        </article>
        <article className="card" data-src="meet">
          <Image className="how-ic" src="/brand/icons/timeless.webp" alt="" width={56} height={56} /><h2>פגישה מ-Timeless</h2>
          <ol><li>פותחים את הפגישה ב-Timeless</li><li>מורידים את התמלול (TXT, DOCX או PDF)</li><li>גוררים לכאן. הדוברים והזמנים נשמרים</li></ol>
        </article>
        <article className="card" data-src="doc">
          <Image className="how-ic" src="/brand/icons/document.webp" alt="" width={56} height={56} /><h2>מסמך או הצעה</h2>
          <ol><li>הצעות מחיר, בריפים ודוחות</li><li>PDF, DOCX או טקסט</li><li>אותו קובץ פעמיים לא ייקלט פעמיים</li></ol>
        </article>
        <article className="card" data-src="media">
          <Image className="how-ic" src="/brand/icons/recordings-images.webp" alt="" width={56} height={56} /><h2>הקלטות ותמונות</h2>
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
