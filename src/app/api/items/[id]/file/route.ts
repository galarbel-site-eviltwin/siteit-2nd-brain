import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { items } from "@/lib/db/schema";
import { getEmployee } from "@/lib/session";
import { signedUrl } from "@/lib/storage";

// The original file, through a two-minute signed link issued only after the access check.
export async function GET(_req: Request, ctx: RouteContext<"/api/items/[id]/file">) {
  const me = await getEmployee();
  if (!me) return new Response("Unauthorized", { status: 401 });
  const { id } = await ctx.params;
  const [item] = await db.select({ path: items.storagePath, meta: items.meta }).from(items).where(eq(items.id, id)).limit(1);
  // Files from a connected source are not copied: send the person to the original.
  const link = (item?.meta as { link?: string } | null)?.link;
  if (!item?.path && link) return Response.redirect(link, 302);
  if (!item?.path) return new Response("Not found", { status: 404 });
  return Response.redirect(await signedUrl(item.path), 302);
}
