import { desc } from "drizzle-orm";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { auditLog, employees } from "@/lib/db/schema";
import { requireEmployee } from "@/lib/session";

const fmt = new Intl.DateTimeFormat("he-IL", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Jerusalem" });

const actions: Record<string, string> = { login: "נכנס", login_denied: "נחסם" };
const reasons: Record<string, string> = { not_on_list: "לא ברשימה", inactive: "גישה מושבתת", email_not_verified: "מייל לא מאומת" };

export default async function Admin() {
  const me = await requireEmployee();
  if (me.role !== "admin") notFound();

  const [people, events] = await Promise.all([
    db.select().from(employees).orderBy(employees.name),
    db.select().from(auditLog).orderBy(desc(auditLog.at)).limit(15),
  ]);

  return (
    <>
      <div className="page-head">
        <h1>ניהול</h1>
        <p>מי יכול להיכנס, ומי ניסה. רק מיילים שברשימה נכנסים, גם אם יש להם חשבון Google תקין.</p>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>עובדים</h2>
          <div className="rows">
            {people.map((p) => (
              <div key={p.id}>
                <span className="av">{p.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</span>
                <span><b>{p.name}</b><span className="sub ltr">{p.email}</span></span>
                <span className={`tag ${p.role === "admin" ? "admin" : ""}`}>{p.role === "admin" ? "מנהל" : p.active ? "עובד" : "מושבת"}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="card">
          <h2>כניסות אחרונות</h2>
          <div className="rows">
            {events.length === 0 && <p className="muted">עוד אין כניסות.</p>}
            {events.map((e) => {
              const reason = (e.detail as { reason?: string } | null)?.reason;
              return (
                <div key={e.id}>
                  <span className={`tag ${e.action === "login_denied" ? "admin" : ""}`}>{actions[e.action] ?? e.action}</span>
                  <span><b className="ltr">{e.actorEmail ?? "ללא מייל"}</b>{reason && <span className="sub">{reasons[reason] ?? reason}</span>}</span>
                  <span className="sub">{fmt.format(e.at)}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
