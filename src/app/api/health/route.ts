import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

// Liveness for deploys: says whether the database answers, and nothing else.
export const dynamic = "force-dynamic";

export async function GET() {
  const started = Date.now();
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, db: "ok", ms: Date.now() - started });
  } catch {
    return Response.json({ ok: false, db: "unreachable" }, { status: 503 });
  }
}
