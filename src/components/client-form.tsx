import { db } from "@/lib/db";
import { employees, type Client } from "@/lib/db/schema";
import { SERVICES, STATUS } from "@/lib/clients";
import { eq } from "drizzle-orm";

type Props = { action: (f: FormData) => Promise<void>; client?: Client; back?: string; error?: string; defaultOwner: string };

const errors: Record<string, string> = {
  name: "חסר שם לקוח.",
  alias: "אחד הדומיינים או השמות כבר משויך ללקוח אחר. כל דומיין יכול להצביע על לקוח אחד בלבד.",
};

export async function ClientForm({ action, client, back, error, defaultOwner }: Props) {
  const team = await db.select({ id: employees.id, name: employees.name }).from(employees).where(eq(employees.active, true)).orderBy(employees.name);
  return (
    <form action={action} className="card form">
      {error && <p className="alert" role="alert">{errors[error] ?? "משהו השתבש. נסה שוב."}</p>}
      {client && <input type="hidden" name="id" value={client.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <div className="field">
        <label htmlFor="name">שם הלקוח</label>
        <input id="name" name="name" required defaultValue={client?.name} placeholder="למשל: סטודיו נגה עיצוב פנים" />
      </div>

      {!client && (
        <>
          <div className="field">
            <label htmlFor="domains">דומיין האתר</label>
            <input id="domains" name="domains" className="ltr" placeholder="noga-studio.co.il" />
            <p className="hint">המוח משתמש בזה כדי לזהות לבד לאיזה לקוח שייכת שיחה או מסמך. אפשר כמה, מופרדים בפסיק.</p>
          </div>
          <div className="field">
            <label htmlFor="nicknames">שמות נוספים</label>
            <input id="nicknames" name="nicknames" placeholder="נגה, Noga Studio" />
            <p className="hint">איך קוראים ללקוח בשיחות ובשמות קבצים. מופרדים בפסיק.</p>
          </div>
        </>
      )}

      <fieldset className="field">
        <legend>שירותים</legend>
        <div className="checks">
          {(Object.keys(SERVICES) as (keyof typeof SERVICES)[]).map((s) => (
            <label key={s} className="check-chip"><input type="checkbox" name="services" value={s} defaultChecked={client?.services.includes(s)} />{SERVICES[s]}</label>
          ))}
        </div>
      </fieldset>

      <div className="cols-2">
        <div className="field">
          <label htmlFor="ownerId">אחראי על הלקוח</label>
          <select id="ownerId" name="ownerId" defaultValue={client?.ownerId ?? defaultOwner}>
            {team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        {client && (
          <div className="field">
            <label htmlFor="status">סטטוס</label>
            <select id="status" name="status" defaultValue={client.status}>
              {(Object.keys(STATUS) as (keyof typeof STATUS)[]).map((s) => <option key={s} value={s}>{STATUS[s]}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="field">
        <label htmlFor="notes">הערות</label>
        <textarea id="notes" name="notes" rows={3} defaultValue={client?.notes ?? ""} />
      </div>

      <div className="actions">
        <button className="btn btn-primary">{client ? "שמירה" : "יצירת לקוח"}</button>
      </div>
    </form>
  );
}
