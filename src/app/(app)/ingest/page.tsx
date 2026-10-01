import { count, eq } from "drizzle-orm";
import Image from "next/image";
import Link from "next/link";
import { bulkDeleteItemsAction } from "../actions";
import { AssignForm } from "@/components/assign-form";
import { ConfirmDelete } from "@/components/confirm-submit";
import { SelectAll } from "@/components/select-all";
import { Dropzone } from "@/components/dropzone";
import { KindIcon } from "@/components/kind-icon";
import { clientOptions, recentItems } from "@/lib/clients";
import { db } from "@/lib/db";
import { driveFolders } from "@/lib/db/schema";
import { getConnection, getRoots, type DriveConfig } from "@/lib/drive/google";
import { ago, fmtDate } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const Pick = ({ id, title }: { id: string; title: string }) => (
  <label className="bulk-pick"><input type="checkbox" name="itemIds" value={id} form="bulk-items" aria-label={`סימון ${title}`} /></label>
);

export default async function Ingest({ searchParams }: PageProps<"/ingest">) {
  await requireEmployee();
  const sp = await searchParams;
  const deleted = Number(sp.deleted ?? 0), skipped = Number(sp.skipped ?? 0);
  const [rows, options, conn, [{ n: newFolders }]] = await Promise.all([
    recentItems(60), clientOptions(), getConnection(),
    db.select({ n: count() }).from(driveFolders).where(eq(driveFolders.status, "pending")),
  ]);
  const root = getRoots(conn?.config as DriveConfig).map((r) => r.name).join(", ") || null;
  // Company knowledge has a topic instead of a client, so it never waits for assignment.
  const waiting = rows.filter((r) => !r.topic && r.assignment !== "confirmed" && r.status !== "processing" && r.status !== "failed");
  const done = rows.filter((r) => !waiting.includes(r));

  return (
    <>
      <div className="page-head"><h1>קליטת מידע</h1><p>גרור לכאן כל דבר שקשור ללקוח. המוח קורא, מציע לאיזה לקוח זה שייך, ומחכה שתאשר.</p></div>

      <Dropzone />

      <Link href="/ingest/drive" className="card drive-card">
        <span className="sq lg plate"><img src="/brand/icons/google-drive.svg" alt="" width={34} height={34} /></span>
        <div>
          <b>{root ? `Google Drive: ${root}` : conn ? "Google Drive מחובר" : "חיבור Google Drive"}</b>
          <span className="muted small">{root ? (newFolders ? `${newFolders} תיקיות חדשות מחכות לקישור ללקוח` : "קבצים מתיקיות הלקוחות נקלטים לבד") : conn ? "נשאר לבחור את התיקייה שבה נמצאות תיקיות הלקוחות" : "המוח יקלוט לבד קבצים מתיקיות הלקוחות ב-Drive"}</span>
        </div>
        <span className="btn btn-sm btn-ghost">{root ? "הגדרות" : conn ? "המשך הגדרה" : "חיבור"}</span>
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

      {deleted > 0 && <p className="note" role="status">נמחקו {deleted} פריטים.{skipped ? ` ${skipped} לא נמחקו, כי רק מי שהעלה אותם (או מנהל) יכול למחוק.` : ""}</p>}
      {rows.length > 0 && (
        <div className="bulk-bar card">
          <form id="bulk-items" action={bulkDeleteItemsAction} hidden />
          <span className="muted small">מסמנים פריטים ברשימות למטה, ואז:</span>
          <SelectAll formId="bulk-items" />
          <ConfirmDelete formId="bulk-items" />
        </div>
      )}

      <h2 className="sec-title">מחכים לשיוך <span className="tag solid-plum">{waiting.length}</span></h2>
      {waiting.length === 0 ? (
        <p className="muted">אין כרגע פריטים שמחכים לך.</p>
      ) : (
        <div className="q">
          {waiting.map((it) => (
            <article key={it.id} className="card qitem">
              <Pick id={it.id} title={it.title} />
              <KindIcon kind={it.kind} source={it.source} />
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
      <div className="rows card picks">
        {done.length === 0 && <p className="muted">עוד לא נקלט כלום.</p>}
        {done.map((it) => (
          <div key={it.id}>
            <Pick id={it.id} title={it.title} />
            <KindIcon kind={it.kind} source={it.source} size="sm" />
            <span><Link href={`/items/${it.id}`}><b>{it.title}</b></Link><span className="sub">{it.status === "failed" ? it.error : it.topic ? "ידע החברה" : it.clientName ? `שויך ל${it.clientName}` : ""}</span></span>
            <span className="sub">{ago(it.recordedAt)}</span>
          </div>
        ))}
      </div>
    </>
  );
}
