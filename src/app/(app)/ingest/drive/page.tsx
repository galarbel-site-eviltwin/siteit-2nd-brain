import { ArrowRight, ArrowsClockwise, CheckCircle, Folder, FolderSimpleDashed, LinkBreak, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import { chooseByLinkAction, chooseRootAction, disconnectDriveAction, ignoreFolderAction, mapFolderAction, newClientFromFolderAction, resetFolderAction, syncNowAction } from "./actions";
import { clientOptions } from "@/lib/clients";
import { db } from "@/lib/db";
import { clients, driveFiles, driveFolders } from "@/lib/db/schema";
import { accessToken, getConnection, getFolder, listChildren, listSharedDrives, listSharedWithMeFolders, type DriveConfig } from "@/lib/drive/google";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const errors: Record<string, string> = {
  denied: "החיבור בוטל ב-Google.",
  state: "החיבור פג תוקף. נסה שוב.",
  scope: "לא אושרה הרשאת קריאה ל-Drive. נסה שוב ואשר את כל ההרשאות.",
  refresh: "Google לא החזירה הרשאה קבועה. נסה שוב.",
  exchange: "משהו נכשל בחיבור. נסה שוב.",
  pick: "צריך לבחור לקוח.",
  busy: "סנכרון אחר כבר רץ. נסה שוב בעוד דקה.",
  link: "זה לא נראה כמו קישור לתיקייה ב-Drive. פותחים את התיקייה ב-Drive ומעתיקים את הכתובת מהדפדפן.",
  link_access: "אין לחשבון המחובר גישה לתיקייה הזו. צריך שישתפו אותה איתו.",
  not_folder: "הקישור מוביל לקובץ, לא לתיקייה.",
};

export default async function DrivePage({ searchParams }: PageProps<"/ingest/drive">) {
  await requireEmployee();
  const sp = await searchParams;
  const conn = await getConnection();
  const cfg = (conn?.config ?? {}) as DriveConfig;
  const err = typeof sp.error === "string" ? errors[sp.error] ?? decodeURIComponent(sp.error) : null;

  // Browsing for the root folder: a Shared Drive, My Drive, or what others shared with this account.
  const where = typeof sp.drive === "string" ? sp.drive : null; // shared drive id | "my" | "shared"
  const inside = typeof sp.in === "string" ? sp.in : null;
  let drives: { id: string; name: string }[] = [];
  let folders: { id: string; name: string }[] = [];
  let place: { label: string; driveId?: string; parentId?: string } | null = null;
  let apiError: string | null = null;
  if (conn && !cfg.rootFolderId) {
    try {
      const token = await accessToken();
      drives = await listSharedDrives(token);
      if (where === "shared" && !inside) { place = { label: "משותף איתי" }; folders = await listSharedWithMeFolders(token); }
      else if (where) {
        const driveId = where === "my" || where === "shared" ? undefined : where;
        const parentId = inside ?? (where === "my" ? "root" : where);
        const label = inside ? (await getFolder(token, inside)).name : where === "my" ? "האחסון שלי" : drives.find((d) => d.id === where)?.name ?? "Drive";
        place = { label, driveId, parentId };
        folders = await listChildren(token, parentId, driveId, true);
      }
    } catch (e) {
      apiError = e instanceof Error ? e.message : String(e);
    }
  }

  const [mapping, options] = await Promise.all([
    db.select({ f: driveFolders, clientName: clients.name }).from(driveFolders).leftJoin(clients, eq(clients.id, driveFolders.clientId)).orderBy(driveFolders.name),
    clientOptions(),
  ]);
  const fileCounts = new Map((await db.select({ folderId: driveFiles.folderId, n: count() }).from(driveFiles).groupBy(driveFiles.folderId)).map((r) => [r.folderId, r.n]));
  const pending = mapping.filter((m) => m.f.status === "pending");
  const mapped = mapping.filter((m) => m.f.status === "mapped");
  const ignored = mapping.filter((m) => m.f.status === "ignored");
  const last = conn?.lastResult as { added: number; updated: number; failed: number; more: boolean } | null;

  return (
    <>
      <Link href="/ingest" className="back"><ArrowRight size={20} />קליטת מידע</Link>
      <div className="page-head"><h1 className="with-logo"><img src="/brand/icons/google-drive.svg" alt="" width={44} height={44} />Google Drive</h1><p>המוח עוקב אחרי תיקיות הלקוחות ב-Drive, וקולט לבד כל קובץ חדש או קובץ שהשתנה. בערך כל 15 דקות.</p></div>
      {err && <p className="alert" role="alert"><WarningCircle size={20} weight="fill" /> {err}</p>}
      {sp.synced && <p className="note">הסנכרון הסתיים: {String(sp.synced)} קבצים נקלטו או עודכנו{sp.more ? ". יש עוד, הם ייקלטו בסנכרון הבא" : ""}.</p>}

      {!conn ? (
        <section className="card connect">
          <span className="sq lg plate"><img src="/brand/icons/google-drive.svg" alt="" width={34} height={34} /></span>
          <div>
            <h2>חיבור ה-Drive של החברה</h2>
            <p className="muted">מחברים פעם אחת, עם חשבון שיש לו גישה ל-Drive המשותף. המוח מקבל הרשאת קריאה בלבד: הוא לא משנה, לא מוחק ולא משתף שום קובץ.</p>
          </div>
          <a href="/api/connect/drive/start" className="btn btn-primary"><img src="/brand/icons/google-drive.svg" alt="" width={20} height={20} />חיבור Google Drive</a>
        </section>
      ) : !cfg.rootFolderId ? (
        <section className="card">
          <h2>איפה נמצאות תיקיות הלקוחות?</h2>
          {apiError && <p className="alert">{apiError.includes("403") ? "אין גישה ל-Drive API. צריך להפעיל את Google Drive API בפרויקט ב-Google Cloud." : apiError}</p>}
          {!place ? (
            <>
              <p className="muted small" style={{ marginBottom: 12 }}>הכי פשוט: פתח ב-Drive את התיקייה שבה נמצאות תיקיות הלקוחות, העתק את הכתובת מהדפדפן, והדבק כאן.</p>
              <form action={chooseByLinkAction} className="inline-form" style={{ marginTop: 0, marginBottom: 22, maxWidth: 720 }}>
                <label className="sr-only" htmlFor="link">קישור לתיקייה</label>
                <input id="link" name="link" required className="ltr" placeholder="https://drive.google.com/drive/folders/..." />
                <button className="btn btn-sm btn-primary">זו התיקייה</button>
              </form>
              <p className="muted small" style={{ marginBottom: 12 }}>או חפש אותה:</p>
              <div className="pick-list">
                <Link href="/ingest/drive?drive=my" className="pick"><img src="/brand/icons/google-drive.svg" alt="" width={22} height={22} />האחסון שלי (My Drive)</Link>
                <Link href="/ingest/drive?drive=shared" className="pick"><Folder size={22} weight="fill" />משותף איתי (Shared with me)</Link>
                {drives.map((d) => <Link key={d.id} href={`/ingest/drive?drive=${d.id}`} className="pick"><img src="/brand/icons/google-drive.svg" alt="" width={22} height={22} />{d.name}</Link>)}
              </div>
            </>
          ) : (
            <>
              <p className="muted small" style={{ marginBottom: 12 }}><b>{place.label}</b>: פתח תיקייה כדי להיכנס אליה, או בחר אותה אם בתוכה יושבות תיקיות הלקוחות. <Link href="/ingest/drive">חזרה להתחלה</Link></p>
              <div className="pick-list">
                {place.parentId && place.parentId !== "root" && (
                  <form action={chooseRootAction}>
                    <input type="hidden" name="driveId" value={place.driveId ?? ""} /><input type="hidden" name="rootFolderId" value={place.parentId} /><input type="hidden" name="rootName" value={place.label} />
                    <button className="pick chosen"><CheckCircle size={22} weight="fill" />תיקיות הלקוחות נמצאות כאן, ב&quot;{place.label}&quot;</button>
                  </form>
                )}
                {folders.map((f) => (
                  <div key={f.id} className="pick-row">
                    <Link href={`/ingest/drive?drive=${where}&in=${f.id}`} className="pick"><Folder size={22} />{f.name}</Link>
                    <form action={chooseRootAction}>
                      <input type="hidden" name="driveId" value={place.driveId ?? ""} /><input type="hidden" name="rootFolderId" value={f.id} /><input type="hidden" name="rootName" value={f.name} />
                      <button className="btn btn-sm btn-ghost">בחירה</button>
                    </form>
                  </div>
                ))}
                {folders.length === 0 && <p className="muted">אין כאן תיקיות.</p>}
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          <section className="card connect">
            <span className="sq lg plate"><img src="/brand/icons/google-drive.svg" alt="" width={34} height={34} /></span>
            <div>
              <h2>מחובר: {cfg.rootName}</h2>
              <p className="muted small">
                דרך {conn.accountEmail}.{" "}
                {conn.lastSuccessAt ? `סנכרון אחרון ${ago(conn.lastSuccessAt)}` : "עוד לא סונכרן"}
                {last ? `: ${last.added} חדשים, ${last.updated} עודכנו${last.failed ? `, ${last.failed} נכשלו` : ""}` : ""}.
              </p>
              {conn.lastError && <p className="alert-line" style={{ marginTop: 6 }}><WarningCircle size={18} weight="fill" />{conn.lastError}</p>}
            </div>
            <div className="connect-actions">
              <form action={syncNowAction}><button className="btn btn-primary btn-sm"><ArrowsClockwise size={18} />סנכרון עכשיו</button></form>
              <form action={disconnectDriveAction}><button className="btn btn-ghost btn-sm"><LinkBreak size={18} />ניתוק</button></form>
            </div>
          </section>

          {pending.length > 0 && (
            <>
              <h2 className="sec-title">תיקיות חדשות <span className="tag solid-plum">{pending.length}</span></h2>
              <p className="muted" style={{ marginBottom: 14 }}>לאיזה לקוח שייכת כל תיקייה? עד שתחליט, המוח לא קורא ממנה כלום.</p>
              <div className="q">
                {pending.map(({ f }) => {
                  const suggested = options.find((o) => o.id === f.suggestedClientId);
                  return (
                    <article key={f.folderId} className="card qitem">
                      <span className="sq" data-src="doc"><FolderSimpleDashed weight="fill" size={22} /></span>
                      <div>
                        <b>{f.name}</b>
                        {suggested && <p className="muted small">נראה כמו הלקוח <b>{suggested.name}</b>.</p>}
                        <div className="assign">
                          <form action={mapFolderAction} className="assign-form">
                            <input type="hidden" name="folderId" value={f.folderId} />
                            <select name="clientId" defaultValue={suggested?.id ?? ""} aria-label="לקוח">
                              <option value="">לקוח קיים...</option>
                              {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                            <button className="btn btn-sm btn-primary"><CheckCircle size={18} weight="fill" />קישור</button>
                          </form>
                          <div className="assign-form">
                            <form action={newClientFromFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="btn btn-sm btn-ghost">לקוח חדש בשם &quot;{f.name}&quot;</button></form>
                            <form action={ignoreFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="btn btn-sm btn-ghost">לא לקוח, להתעלם</button></form>
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="sec-title">תיקיות מקושרות</h2>
          <div className="rows card">
            {mapped.length === 0 && <p className="muted">עוד אין תיקיות מקושרות.</p>}
            {mapped.map(({ f, clientName }) => (
              <div key={f.folderId}>
                <span className="sq sm" data-src="wa"><Folder weight="fill" size={18} /></span>
                <span><b>{f.name}</b><span className="sub">{clientName ? <Link href={`/clients/${f.clientId}`}>{clientName}</Link> : "לקוח נמחק"}, {fileCounts.get(f.folderId) ?? 0} קבצים</span></span>
                <form action={resetFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="btn btn-sm btn-ghost">שינוי</button></form>
              </div>
            ))}
          </div>

          {ignored.length > 0 && (
            <>
              <h2 className="sec-title">תיקיות שהמוח מתעלם מהן</h2>
              <div className="rows card">
                {ignored.map(({ f }) => (
                  <div key={f.folderId}>
                    <span className="sq sm" data-src="brain"><Folder size={18} /></span>
                    <span><b>{f.name}</b></span>
                    <form action={resetFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="btn btn-sm btn-ghost">להחזיר</button></form>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </>
  );
}
