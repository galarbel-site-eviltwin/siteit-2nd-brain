import { MagnifyingGlass, Plus, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { listClients, monoColor, SERVICES, STATUS, type Service } from "@/lib/clients";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const FILTERS = [["all", "הכול"], ["seo", "קידום SEO"], ["geo", "GEO"], ["web", "בניית אתרים"], ["mine", "שלי"], ["attn", "ממתין לשיוך"]] as const;
const SRC: Record<Service, string> = { seo: "meet", geo: "wa", web: "doc" };

export default async function Clients({ searchParams }: PageProps<"/clients">) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim() : "";
  const f = typeof sp.f === "string" ? sp.f : "all";
  const all = await listClients();
  const shown = all.filter((c) =>
    (f === "all" || (c.services as string[]).includes(f) || (f === "mine" && c.ownerName === me.name) || (f === "attn" && c.pending > 0)) &&
    (!q || c.name.includes(q) || (c.domain ?? "").includes(q.toLowerCase())),
  );
  const active = all.filter((c) => c.status === "active").length;

  return (
    <>
      <div className="page-head split">
        <div><h1>לקוחות</h1><p>{all.length ? `${active} לקוחות פעילים` : "עוד אין לקוחות. מתחילים מאחד."}</p></div>
        <Link href="/clients/new" className="btn btn-primary"><Plus weight="bold" size={20} />לקוח חדש</Link>
      </div>

      {all.length > 0 && (
        <form className="tools" role="search">
          <label className="search"><MagnifyingGlass size={22} /><span className="sr-only">חיפוש לקוח</span><input name="q" type="search" defaultValue={q} placeholder="שם או דומיין" /></label>
          {f !== "all" && <input type="hidden" name="f" value={f} />}
          <div className="chips">
            {FILTERS.map(([k, label]) => (
              <Link key={k} href={`/clients?f=${k}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="chip" aria-pressed={f === k}>{label}</Link>
            ))}
          </div>
        </form>
      )}

      <div className="cgrid">
        {shown.map((c) => (
          <Link key={c.id} href={`/clients/${c.id}`} className="client">
            <div className="client-top">
              <span className="mono" style={{ background: monoColor(c.id) }}>{c.name.trim()[0]}</span>
              <div><b>{c.name}</b>{c.domain && <span className="dom ltr">{c.domain}</span>}</div>
            </div>
            <div className="tags">
              {(c.services as Service[]).map((s) => <span key={s} className="tag" data-src={SRC[s]}>{SERVICES[s]}</span>)}
              {c.status !== "active" && <span className="tag outline">{STATUS[c.status]}</span>}
            </div>
            {c.pending > 0 && <span className="alert-line"><WarningCircle weight="fill" size={18} />{c.pending} פריטים ממתינים לאישור שיוך</span>}
            <div className="client-foot">
              <span>{c.ownerName ?? "בלי אחראי"}</span>
              <span>{c.itemCount ? `${c.itemCount} פריטים, אחרון ${ago(c.lastAt)}` : "עוד אין מידע"}</span>
            </div>
          </Link>
        ))}
        {all.length === 0 && (
          <div className="empty">
            <b>המוח עוד לא מכיר אף לקוח</b>
            <p className="muted">פתח לקוח ראשון עם השם והדומיין שלו, ואז העלה אליו שיחה או תמלול.</p>
            <Link href="/clients/new" className="btn btn-primary"><Plus weight="bold" size={20} />לקוח ראשון</Link>
          </div>
        )}
        {all.length > 0 && shown.length === 0 && <div className="empty"><b>לא נמצא לקוח כזה</b><p className="muted">נסה שם אחר או דומיין.</p></div>}
      </div>
    </>
  );
}
