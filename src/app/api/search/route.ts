import { searchSources } from "@/lib/ai/search";
import { describe } from "@/lib/item-label";
import { getEmployee } from "@/lib/session";

// "Sources only": the same search the brain uses, with no AI answer on top.
export async function GET(req: Request) {
  const me = await getEmployee();
  if (!me) return Response.json({ error: "צריך להתחבר מחדש" }, { status: 401 });
  const u = new URL(req.url);
  const q = (u.searchParams.get("q") ?? "").trim();
  if (!q) return Response.json({ sources: [] });
  const sources = await searchSources(q, { clientId: u.searchParams.get("clientId") || null }, 20);
  return Response.json({ sources: sources.map((s) => ({ ...s, what: describe(s.kind as never, s.source as never).label })) });
}
