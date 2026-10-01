import { catchUpAI } from "@/lib/ai/summarize";
import { syncDrive } from "@/lib/drive/sync";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

// Called by Vercel Cron every 15 minutes (vercel.json). Vercel sends CRON_SECRET as a bearer token.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("Unauthorized", { status: 401 });
  const result = await syncDrive({ budgetMs: 180_000 });
  const ai = await catchUpAI(80_000).catch((e) => ({ error: (e as Error).message }));
  return Response.json({ ...result, ai });
}
