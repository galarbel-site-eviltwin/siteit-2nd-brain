import { SealCheck } from "@phosphor-icons/react/dist/ssr";
import { and, count, desc, eq } from "drizzle-orm";
import Link from "next/link";
import { FactRow } from "@/components/fact-row";
import { db } from "@/lib/db";
import { clients, facts, items } from "@/lib/db/schema";
import { FACT_KIND, isFactKind } from "@/lib/facts";
import { requireEmployee } from "@/lib/session";

export default async function Review({ searchParams }: PageProps<"/review">) {
  await requireEmployee();
  const sp = await searchParams;
  const kind = isFactKind(sp.kind) ? sp.kind : null;
  const editing = typeof sp.edit === "string" ? sp.edit : null;
  const [rows, byKind] = await Promise.all([
    db.select({ f: facts, itemTitle: items.title, clientName: clients.name }).from(facts)
      .innerJoin(items, eq(items.id, facts.itemId)).leftJoin(clients, eq(clients.id, facts.clientId))
      .where(and(eq(facts.status, "pending"), kind ? eq(facts.kind, kind) : undefined))
      .orderBy(desc(facts.occurredAt)).limit(100),
    db.select({ kind: facts.kind, n: count() }).from(facts).where(eq(facts.status, "pending")).groupBy(facts.kind),
  ]);
  const total = byKind.reduce((s, k) => s + k.n, 0);
  const href = (id: string) => `/review?${new URLSearchParams({ ...(kind ? { kind } : {}), edit: id })}`;

  return (
    <>
      <div className="page-head">
        <h1>לבדיקה</h1>
        <p>החלטות, התחייבויות, מחירים ותאריכים שהמוח שלף מהשיחות, הפגישות והמיילים, ושלא נאמרו שם במפורש. מה שנאמר במפורש נכנס לבד, ואפשר לתקן אותו בעמוד הלקוח.</p>
      </div>

      <div className="chips" aria-label="סוגים" style={{ marginBottom: 16 }}>
        <Link href="/review" className="chip" aria-current={!kind ? "page" : undefined}>הכול <span className="count">{total}</span></Link>
        {Object.entries(FACT_KIND).map(([k, v]) => (
          <Link key={k} href={`/review?kind=${k}`} className="chip" aria-current={kind === k ? "page" : undefined}>{v.plural} <span className="count">{byKind.find((b) => b.kind === k)?.n ?? 0}</span></Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="empty">
          <SealCheck size={40} weight="duotone" />
          <b>אין כרגע מה לבדוק</b>
          <p className="muted">כשהמוח ישלוף ממקור משהו שלא נאמר במפורש, הוא יחכה כאן לאישור, לתיקון או לדחייה. השליפה תתחיל לעבוד כשהמפתח של Claude יופעל.</p>
        </div>
      ) : (
        <div className="facts">
          {rows.map(({ f, itemTitle, clientName }) => (
            <FactRow key={f.id} f={f} itemTitle={itemTitle} clientName={clientName} review editing={editing === f.id} editHref={href(f.id)} />
          ))}
        </div>
      )}
    </>
  );
}
