import { CheckCircle, Circle } from "@phosphor-icons/react/dist/ssr";
import { requireEmployee } from "@/lib/session";

const done = [
  "כניסה עם רשימת עובדים מאושרת. מי שלא ברשימה נחסם",
  "מסד נתונים ב-Supabase (פרנקפורט), סגור ל-API הציבורי",
  "יומן כניסות: כל ניסיון נרשם, גם כשנחסם",
  "מצב בהיר וכהה, עברית מימין לשמאל, מובייל",
];
const next = [
  "חיבור הכניסה עם Google (מחכה ל-Google Cloud)",
  "העלאה לענן ב-Vercel, בפרנקפורט",
  "שלב 1: לקוחות וקליטת מידע ידנית",
];

export default async function Today() {
  const me = await requireEmployee();
  const first = me.name.split(" ")[0];
  return (
    <>
      <div className="page-head">
        <h1>בוקר טוב, {first}</h1>
        <p>הבסיס של המוח עומד. המסכים מהמוקאפ ייכנסו לכאן שלב אחרי שלב.</p>
      </div>
      <div className="grid-2">
        <section className="card">
          <h2>מה עובד עכשיו</h2>
          {done.map((t) => (
            <p key={t} className="check"><CheckCircle size={22} weight="fill" color="#0E9E63" />{t}</p>
          ))}
        </section>
        <section className="card">
          <h2>מה הלאה</h2>
          {next.map((t) => (
            <p key={t} className="check"><Circle size={22} color="var(--ink-3)" />{t}</p>
          ))}
        </section>
      </div>
    </>
  );
}
