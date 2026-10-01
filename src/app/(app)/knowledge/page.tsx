import { Sparkle } from "@phosphor-icons/react/dist/ssr";
import { and, count, desc, eq, isNotNull } from "drizzle-orm";
import Link from "next/link";
import { KindIcon } from "@/components/kind-icon";
import { KnowledgeUpload } from "@/components/knowledge-upload";
import { db } from "@/lib/db";
import { employees, items } from "@/lib/db/schema";
import { ago } from "@/lib/format";
import { isTopic, TOPICS, type Topic } from "@/lib/knowledge";
import { requireEmployee } from "@/lib/session";

export default async function Knowledge({ searchParams }: PageProps<"/knowledge">) {
  await requireEmployee();
  const sp = await searchParams;
  const topic: Topic | null = isTopic(sp.topic) ? sp.topic : null;
  const [counts, list] = await Promise.all([
    db.select({ topic: items.topic, n: count() }).from(items).where(isNotNull(items.topic)).groupBy(items.topic),
    db.select({ it: items, byName: employees.name }).from(items).leftJoin(employees, eq(employees.id, items.createdBy))
      .where(topic ? eq(items.topic, topic) : isNotNull(items.topic)).orderBy(desc(items.recordedAt)).limit(200),
  ]);
  const n = (t: string) => counts.find((c) => c.topic === t)?.n ?? 0;
  const total = counts.reduce((s, c) => s + c.n, 0);

  return (
    <>
      <div className="page-head">
        <h1>ידע החברה</h1>
        <p>מה שלא שייך ללקוח אחד: נהלים, מחירונים, תבניות, הדרכות וחומרי חברה. המוח משתמש בזה כשהוא עונה על איך עושים דברים אצלנו.</p>
      </div>

      <section className="card"><KnowledgeUpload initial={topic ?? "procedures"} /></section>

      <div className="chips" aria-label="נושאים" style={{ margin: "22px 0 14px" }}>
        <Link href="/knowledge" className={`chip ${!topic ? "on" : ""}`} aria-current={!topic ? "page" : undefined}>הכול <span className="count">{total}</span></Link>
        {Object.entries(TOPICS).map(([k, v]) => (
          <Link key={k} href={`/knowledge?topic=${k}`} className={`chip ${topic === k ? "on" : ""}`} aria-current={topic === k ? "page" : undefined}>{v} <span className="count">{n(k)}</span></Link>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="empty">
          <b>{topic ? `עוד אין מסמכים ב"${TOPICS[topic]}"` : "עוד אין ידע חברה"}</b>
          <p className="muted">מעלים כאן נוהל עבודה, מחירון או תבנית הצעת מחיר, והמוח יוכל להסתמך עליהם בתשובות.</p>
        </div>
      ) : (
        <div className="rows card">
          {list.map(({ it, byName }) => (
            <div key={it.id}>
              <KindIcon kind={it.kind} source={it.source} size="sm" />
              <span><Link href={`/items/${it.id}`}><b>{it.title}</b></Link><span className="sub">{TOPICS[it.topic as Topic] ?? ""}{byName ? `, הועלה ע"י ${byName}` : ""}{it.status === "stored" ? ". נשמר, עוד לא נקרא" : it.status === "failed" ? `. ${it.error}` : ""}</span></span>
              <span className="sub">{ago(it.recordedAt)}</span>
            </div>
          ))}
        </div>
      )}

      {total > 0 && (
        <p style={{ marginTop: 18 }}><Link href="/ask?client=company" className="btn btn-ghost"><Sparkle size={18} weight="fill" />לשאול את המוח על ידע החברה</Link></p>
      )}
    </>
  );
}
