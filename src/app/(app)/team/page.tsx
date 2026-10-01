import { Plus, Prohibit, UserCheck } from "@phosphor-icons/react/dist/ssr";
import { desc, inArray } from "drizzle-orm";
import { addEmployeeAction, setActiveAction, updateEmployeeAction } from "./actions";
import { db } from "@/lib/db";
import { auditLog, employees } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { requireEmployee } from "@/lib/session";

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

const ERRORS: Record<string, string> = {
  missing: "צריך שם ומייל.",
  domain: "אפשר להוסיף רק מייל של החברה (@eviltwin.io). המוח מיועד לעובדי סייט איט בלבד.",
  exists: "המייל הזה כבר ברשימה.",
  self: "אי אפשר להשבית את עצמך.",
  last_admin: "צריך להישאר לפחות מנהל פעיל אחד.",
};

const ACTIONS: Record<string, string> = {
  login: "נכנס", login_denied: "נחסם בכניסה", employee_added: "הוסיף עובד", employee_updated: "עדכן עובד",
  employee_disabled: "השבית גישה", employee_enabled: "החזיר גישה",
};
const REASONS: Record<string, string> = { not_on_list: "לא ברשימה", inactive: "גישה מושבתת", email_not_verified: "מייל לא מאומת" };

export default async function Team({ searchParams }: PageProps<"/team">) {
  const me = await requireEmployee();
  const sp = await searchParams;
  const [people, log] = await Promise.all([
    db.select().from(employees).orderBy(desc(employees.active), employees.name),
    db.select().from(auditLog).where(inArray(auditLog.action, Object.keys(ACTIONS))).orderBy(desc(auditLog.at)).limit(25),
  ]);
  const err = typeof sp.error === "string" ? ERRORS[sp.error] : null;

  return (
    <>
      <div className="page-head">
        <h1>צוות</h1>
        <p>מי יכול להיכנס למוח. נכנסים רק מיילים שברשימה, וכל עובד יכול לנהל אותה. כל שינוי נרשם, עם מי שעשה אותו.</p>
      </div>
      {err && <p className="alert" role="alert">{err}</p>}
      {sp.added && <p className="note" role="status">העובד נוסף. מעכשיו הוא יכול להיכנס עם חשבון ה-Google של החברה.</p>}

      <section className="card">
        <h2>עובדים</h2>
        <div className="team">
          {people.map((p) => (
            <div key={p.id} className={`member ${p.active ? "" : "off"}`}>
              <span className="av">{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
              <form action={updateEmployeeAction} className="member-form">
                <input type="hidden" name="id" value={p.id} />
                <input name="name" defaultValue={p.name} aria-label={`השם של ${p.name}`} />
                <span className="sub ltr">{p.email}</span>
                <select name="role" defaultValue={p.role} aria-label="תפקיד">
                  <option value="member">עובד</option>
                  <option value="admin">מנהל</option>
                </select>
                <button className="btn btn-sm btn-ghost">שמירה</button>
              </form>
              <span className="sub">{!p.active ? "גישה מושבתת" : p.lastLoginAt ? `נכנס ${ago(p.lastLoginAt)}` : "עוד לא נכנס"}</span>
              {p.id !== me.id && (
                <form action={setActiveAction}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="active" value={p.active ? "0" : "1"} />
                  <button className={`btn btn-sm ${p.active ? "btn-danger" : "btn-ghost"}`}>{p.active ? <><Prohibit size={16} />השבתת גישה</> : <><UserCheck size={16} />החזרת גישה</>}</button>
                </form>
              )}
            </div>
          ))}
        </div>
        <p className="hint">מנהל יכול גם למחוק פריטים שאחרים העלו. חוץ מזה אין הבדל, וכולם רואים הכול.</p>

        <form action={addEmployeeAction} className="inline-form" style={{ marginTop: 18 }}>
          <input name="name" required placeholder="שם מלא" aria-label="שם מלא" />
          <input name="email" type="email" required placeholder="name@eviltwin.io" aria-label="מייל" className="ltr" />
          <select name="role" defaultValue="member" aria-label="תפקיד"><option value="member">עובד</option><option value="admin">מנהל</option></select>
          <button className="btn btn-sm btn-primary"><Plus size={16} />הוספת עובד</button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 22 }}>
        <h2>מה קרה לאחרונה</h2>
        <div className="rows">
          {log.length === 0 && <p className="muted">עוד אין פעולות.</p>}
          {log.map((e) => {
            const d = (e.detail ?? {}) as { reason?: string; email?: string; name?: string; role?: string };
            const what = [d.email && e.action !== "login" && e.action !== "login_denied" ? d.email : null, d.role ? `תפקיד: ${d.role === "admin" ? "מנהל" : "עובד"}` : null, d.reason ? REASONS[d.reason] ?? d.reason : null].filter(Boolean).join(", ");
            return (
              <div key={e.id}>
                <span className={`tag ${e.action === "login_denied" || e.action === "employee_disabled" ? "admin" : ""}`}>{ACTIONS[e.action] ?? e.action}</span>
                <span><b className="ltr">{e.actorEmail ?? "ללא מייל"}</b>{what && <span className="sub">{what}</span>}</span>
                <span className="sub">{fmt.format(e.at)}</span>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
}
