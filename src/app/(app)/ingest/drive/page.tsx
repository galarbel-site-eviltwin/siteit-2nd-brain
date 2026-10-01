import { ArrowRight, ArrowsClockwise, Check, CheckCircle, Folder, LinkBreak, LinkSimple, Plus, Trash, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { count, eq } from "drizzle-orm";
import Link from "next/link";
import {
  addRootAction, addRootByLinkAction, bulkFoldersAction, disconnectDriveAction, ignoreFolderAction, mapFolderAction,
  newClientFromFolderAction, removeRootAction, resetFolderAction, setRootServiceAction, syncNowAction,
} from "./actions";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ClientMark } from "@/components/client-mark";
import { SelectAll } from "@/components/select-all";
import { clientOptions } from "@/lib/clients";
import { db } from "@/lib/db";
import { clients, driveFiles, driveFolders } from "@/lib/db/schema";
import { accessToken, getConnection, getFolder, getRoots, listChildren, listSharedDrives, listSharedWithMeFolders, SERVICE_SETS, type DriveConfig } from "@/lib/drive/google";
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
  none_checked: "לא סומנה אף תיקייה.",
};

const svcKey = (services: string[]) => (services.includes("web") ? "web" : services.includes("seo") ? "seo" : "none");
const DriveIcon = ({ size = 22 }: { size?: number }) => <img src="/brand/icons/google-drive.svg" alt="" width={size} height={size} />;

export default async function DrivePage({ searchParams }: PageProps<"/ingest/drive">) {
  await requireEmployee();
  const sp = await searchParams;
  const conn = await getConnection();
  const roots = getRoots(conn?.config as DriveConfig);
  const picking = !!conn && (roots.length === 0 || sp.add === "1");
  const svc = typeof sp.svc === "string" && sp.svc in SERVICE_SETS ? sp.svc : null;
  const err = typeof sp.error === "string" ? errors[sp.error] ?? decodeURIComponent(sp.error) : null;
  const q = (extra: string) => `/ingest/drive?add=1${svc ? `&svc=${svc}` : ""}${extra}`;

  // Browsing for a top folder: a Shared Drive, My Drive, or what others shared with this account.
  const where = typeof sp.drive === "string" ? sp.drive : null; // shared drive id | "my" | "shared"
  const inside = typeof sp.in === "string" ? sp.in : null;
  let drives: { id: string; name: string }[] = [];
  let folders: { id: string; name: string }[] = [];
  let place: { label: string; driveId?: string; parentId?: string; up?: string; crumbs: { label: string; href: string }[] } | null = null;
  let apiError: string | null = null;
  if (picking && svc) {
    try {
      const token = await accessToken();
      drives = await listSharedDrives(token);
      if (where === "shared" && !inside) { place = { label: "משותף איתי", up: q(""), crumbs: [{ label: "משותף איתי", href: q("&drive=shared") }] }; folders = await listSharedWithMeFolders(token); }
      else if (where) {
        const driveId = where === "my" || where === "shared" ? undefined : where;
        const parentId = inside ?? (where === "my" ? "root" : where);
        const here = inside ? await getFolder(token, inside) : null;
        const label = here ? here.name : where === "my" ? "האחסון שלי" : drives.find((d) => d.id === where)?.name ?? "Drive";
        // One level up: the parent folder, unless the parent is the top of this Drive.
        const parent = here?.parents?.[0];
        const atTop = !parent || parent === driveId || (where === "my" && !(await getFolder(token, parent).then((p) => p.parents?.length).catch(() => 0)));
        const up = here ? (atTop || where === "shared" ? q(where === "shared" ? "&drive=shared" : `&drive=${where}`) : q(`&drive=${where}&in=${parent}`)) : q("");
        // The path from the top of this Drive down to here, for the "you are here" bar.
        const base = where === "my" ? "האחסון שלי" : where === "shared" ? "משותף איתי" : drives.find((d) => d.id === where)?.name ?? "Drive";
        const chain: { id: string; name: string }[] = [];
        let cur: string | undefined = inside ?? undefined;
        for (let i = 0; cur && i < 8; i++) {
          if (cur === driveId) break;
          const node = i === 0 && here ? here : await getFolder(token, cur).catch(() => null);
          if (!node || (where === "my" && !node.parents?.length)) break; // My Drive itself has no parent
          chain.unshift({ id: node.id, name: node.name });
          cur = node.parents?.[0];
        }
        const crumbs = [{ label: base, href: q(`&drive=${where}`) }, ...chain.map((c) => ({ label: c.name, href: q(`&drive=${where}&in=${c.id}`) }))];
        place = { label, driveId, parentId, up, crumbs };
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
  const rootOf = (id: string | null) => roots.find((r) => r.id === id);
  // "Back" walks one step back through the setup instead of leaving it.
  const back = picking
    ? place?.up ? { href: place.up, label: "חזרה" }
      : svc ? { href: "/ingest/drive?add=1", label: "חזרה לבחירת סוג הלקוחות" }
      : roots.length ? { href: "/ingest/drive", label: "Google Drive" } : { href: "/ingest", label: "קליטת מידע" }
    : { href: "/ingest", label: "קליטת מידע" };

  return (
    <>
      <Link href={back.href} className="back"><ArrowRight size={20} />{back.label}</Link>
      <div className="page-head"><h1 className="with-logo"><DriveIcon size={44} />Google Drive</h1><p>המוח עוקב אחרי תיקיות הלקוחות ב-Drive, וקולט לבד כל קובץ חדש או קובץ שהשתנה. בערך כל 15 דקות.</p></div>
      {err && <p className="alert" role="alert"><WarningCircle size={20} weight="fill" /> {err}</p>}
      {sp.synced && <p className="note">הסנכרון הסתיים: {String(sp.synced)} קבצים נקלטו או עודכנו{sp.more ? ". יש עוד, הם ייקלטו בסנכרון הבא" : ""}.</p>}
      {sp.bulk && <p className="note">טופלו {String(sp.bulk)} תיקיות.</p>}

      {!conn ? (
        <section className="card connect">
          <span className="sq lg plate"><DriveIcon size={34} /></span>
          <div>
            <h2>חיבור ה-Drive של החברה</h2>
            <p className="muted">מחברים פעם אחת, עם חשבון שיש לו גישה לתיקיות הלקוחות. המוח מקבל הרשאת קריאה בלבד: הוא לא משנה, לא מוחק ולא משתף שום קובץ.</p>
          </div>
          <a href="/api/connect/drive/start" className="btn btn-primary"><DriveIcon size={20} />חיבור Google Drive</a>
        </section>
      ) : picking ? (
        <section className="card">
          <div className="card-head">
            <h2>{roots.length ? "חיבור תיקייה ראשית נוספת" : "איפה נמצאות תיקיות הלקוחות?"}</h2>
            {roots.length > 0 && <Link href="/ingest/drive" className="btn btn-sm btn-ghost">ביטול</Link>}
          </div>

          <p className="step-label"><span>1</span>אילו לקוחות יש בתיקייה הזו?</p>
          <div className="chips" style={{ marginBottom: 22 }}>
            {Object.entries(SERVICE_SETS).map(([k, v]) => (
              <Link key={k} href={`/ingest/drive?add=1&svc=${k}${where ? `&drive=${where}` : ""}${inside ? `&in=${inside}` : ""}`} className="chip" aria-pressed={svc === k}>{v.label}</Link>
            ))}
          </div>

          {svc && (
            <>
              <p className="step-label"><span>2</span>איזו תיקייה?{place && <span className="where"><Folder size={16} />כרגע ב: {place.crumbs.map((c) => c.label).join(" / ")}</span>}</p>
              {apiError && <p className="alert">{apiError}</p>}
              {!place ? (
                <>
                  <p className="muted small" style={{ marginBottom: 10 }}>הכי פשוט: פתח ב-Drive את התיקייה שבתוכה תיקיות הלקוחות, העתק את הכתובת מהדפדפן, והדבק כאן.</p>
                  <form action={addRootByLinkAction} className="inline-form" style={{ marginTop: 0, marginBottom: 20, maxWidth: 720 }}>
                    <input type="hidden" name="svc" value={svc} />
                    <label className="sr-only" htmlFor="link">קישור לתיקייה</label>
                    <input id="link" name="link" required className="ltr" placeholder="https://drive.google.com/drive/folders/..." />
                    <button className="btn btn-sm btn-primary">זו התיקייה</button>
                  </form>
                  <p className="muted small" style={{ marginBottom: 10 }}>או חפש אותה:</p>
                  <div className="pick-list">
                    <Link href={q("&drive=my")} className="pick"><DriveIcon />האחסון שלי (My Drive)</Link>
                    <Link href={q("&drive=shared")} className="pick"><Folder size={22} weight="fill" />משותף איתי (Shared with me)</Link>
                    {drives.map((d) => <Link key={d.id} href={q(`&drive=${d.id}`)} className="pick"><DriveIcon />{d.name}</Link>)}
                  </div>
                </>
              ) : (
                <>
                  <p className="muted small" style={{ marginBottom: 10 }}>לחץ על תיקייה כדי להיכנס אליה, או &quot;בחירה&quot; אם בתוכה יושבות תיקיות הלקוחות.</p>
                  <div className="pick-list">
                    {place.parentId && place.parentId !== "root" && (
                      <form action={addRootAction}>
                        <input type="hidden" name="svc" value={svc} /><input type="hidden" name="driveId" value={place.driveId ?? ""} /><input type="hidden" name="rootFolderId" value={place.parentId} /><input type="hidden" name="rootName" value={place.label} />
                        <button className="pick chosen"><CheckCircle size={22} weight="fill" />תיקיות הלקוחות נמצאות כאן, ב&quot;{place.label}&quot;</button>
                      </form>
                    )}
                    {folders.map((f) => (
                      <div key={f.id} className="pick-row">
                        <Link href={q(`&drive=${where}&in=${f.id}`)} className="pick"><Folder size={22} />{f.name}</Link>
                        <form action={addRootAction}>
                          <input type="hidden" name="svc" value={svc} /><input type="hidden" name="driveId" value={place.driveId ?? ""} /><input type="hidden" name="rootFolderId" value={f.id} /><input type="hidden" name="rootName" value={f.name} />
                          <button className="btn btn-sm btn-ghost">בחירה</button>
                        </form>
                      </div>
                    ))}
                    {folders.length === 0 && <p className="muted">אין כאן תיקיות.</p>}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="card">
            <div className="connect">
              <span className="sq lg plate"><DriveIcon size={34} /></span>
              <div>
                <h2>מחובר דרך {conn.accountEmail}</h2>
                <p className="muted small">
                  {conn.lastSuccessAt ? `סנכרון אחרון ${ago(conn.lastSuccessAt)}` : "עוד לא סונכרן"}
                  {last ? `: ${last.added} חדשים, ${last.updated} עודכנו${last.failed ? `, ${last.failed} נכשלו` : ""}` : ""}.
                </p>
                {conn.lastError && <p className="alert-line" style={{ marginTop: 6 }}><WarningCircle size={18} weight="fill" />{conn.lastError}</p>}
              </div>
              <div className="connect-actions">
                <form action={syncNowAction}><button className="btn btn-primary btn-sm"><ArrowsClockwise size={18} />סנכרון עכשיו</button></form>
                <form action={disconnectDriveAction}><button className="btn btn-ghost btn-sm"><LinkBreak size={18} />ניתוק</button></form>
              </div>
            </div>

            <h3 className="sub-title">תיקיות ראשיות</h3>
            <p className="muted small">תיקייה ראשית היא התיקייה שבתוכה יושבות תיקיות הלקוחות. אפשר לחבר כמה, למשל אחת ללקוחות קידום ואחת ללקוחות בניית אתרים.</p>
            <div className="rows root-rows">
              {roots.map((r) => (
                <div key={r.id}>
                  <span className="sq sm plate"><DriveIcon size={20} /></span>
                  <span><b>{r.name}</b><span className="sub">{mapping.filter((m) => m.f.rootId === r.id).length} תיקיות לקוח</span></span>
                  <span className="root-actions">
                    <form action={setRootServiceAction} className="root-type">
                      <input type="hidden" name="rootId" value={r.id} />
                      <label htmlFor={`svc-${r.id}`}>סוג הלקוחות</label>
                      <AutoSubmitSelect id={`svc-${r.id}`} name="svc" defaultValue={svcKey(r.services)}>
                        {Object.entries(SERVICE_SETS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                      </AutoSubmitSelect>
                    </form>
                    <form action={removeRootAction}>
                      <input type="hidden" name="rootId" value={r.id} />
                      <button className="btn btn-sm btn-danger" title="המוח יפסיק לעקוב אחרי התיקייה. לקוחות ומה שכבר נקלט נשארים"><Trash size={18} />הסרת התיקייה</button>
                    </form>
                  </span>
                </div>
              ))}
            </div>
            <Link href="/ingest/drive?add=1" className="btn btn-sm btn-ghost" style={{ marginTop: 12 }}><Plus size={18} />חיבור תיקייה ראשית נוספת</Link>
          </section>

          {pending.length > 0 && (
            <>
              <h2 className="sec-title">תיקיות חדשות <span className="tag solid-plum">{pending.length}</span></h2>
              <p className="muted" style={{ marginBottom: 14 }}>סמן את התיקיות שהן לקוחות ולחץ &quot;פתח לקוחות למסומנות&quot;. עד שתחליט, המוח לא קורא מהן כלום.</p>
              <form id="bulk" action={bulkFoldersAction} className="bulk-bar">
                <SelectAll formId="bulk" />
                <span className="bulk-sep" aria-hidden="true" />
                <button name="op" value="new" className="btn btn-sm btn-primary"><CheckCircle size={18} weight="fill" />פתח לקוחות למסומנות</button>
                <button name="op" value="ignore" className="btn btn-sm btn-ghost">התעלם מהמסומנות</button>
              </form>
              <div className="ftiles">
                {pending.map(({ f }) => {
                  const suggested = options.find((o) => o.id === f.suggestedClientId);
                  const root = rootOf(f.rootId);
                  const id = `chk-${f.folderId}`;
                  return (
                    <article key={f.folderId} className="ftile">
                      <input type="checkbox" id={id} name="folderIds" value={f.folderId} form="bulk" className="ftile-check" />
                      <label htmlFor={id} className="ftile-main">
                        <ClientMark id={f.folderId} name={f.name} domain={f.domain} size={52} />
                        <span className="ftile-text">
                          <b>{f.name}</b>
                          <span className="ftile-meta">
                            {f.domain && <span className="ltr">{f.domain}</span>}
                            {root && <span>{SERVICE_SETS[svcKey(root.services)].label}</span>}
                          </span>
                        </span>
                        <span className="ftile-tick" aria-hidden="true"><Check size={16} weight="bold" /></span>
                      </label>
                      <div className="ftile-actions">
                        {suggested ? (
                          <form action={mapFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><input type="hidden" name="clientId" value={suggested.id} /><button className="btn btn-xs btn-primary"><LinkSimple size={16} />קישור ל{suggested.name}</button></form>
                        ) : (
                          <form action={newClientFromFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="btn btn-xs btn-primary"><Plus size={16} weight="bold" />לקוח חדש</button></form>
                        )}
                        <form action={mapFolderAction} className="ftile-link">
                          <input type="hidden" name="folderId" value={f.folderId} />
                          <AutoSubmitSelect name="clientId" defaultValue="" aria-label={`קישור ${f.name} ללקוח קיים`}>
                            <option value="" disabled>לקוח קיים</option>
                            {options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                          </AutoSubmitSelect>
                        </form>
                        <form action={ignoreFolderAction}><input type="hidden" name="folderId" value={f.folderId} /><button className="link-btn">להתעלם</button></form>
                      </div>
                    </article>
                  );
                })}
              </div>
            </>
          )}

          <h2 className="sec-title">תיקיות מקושרות ללקוחות <span className="tag outline">{mapped.length}</span></h2>
          <div className="rows card">
            {mapped.length === 0 && <p className="muted">עוד אין תיקיות מקושרות.</p>}
            {mapped.map(({ f, clientName }) => (
              <div key={f.folderId}>
                <span className="sq sm" data-src="wa"><Folder weight="fill" size={18} /></span>
                <span><b>{f.name}</b><span className="sub">{clientName ? <Link href={`/clients/${f.clientId}`}>{clientName}</Link> : "לקוח נמחק"}, {fileCounts.get(f.folderId) ?? 0} קבצים{rootOf(f.rootId) ? `, ${rootOf(f.rootId)!.name}` : ""}</span></span>
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
