import { syncDrive } from "@/lib/drive/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Called by Vercel Cron every 15 minutes (vercel.json). Vercel sends CRON_SECRET as a bearer token.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const result = await syncDrive({ budgetMs: 240_000 });
  return Response.json(result);
}
