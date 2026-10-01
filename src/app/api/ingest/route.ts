import { after } from "next/server";
import { processItem } from "@/lib/ai/summarize";
import { ingestFile, MAX_BYTES } from "@/lib/ingest/pipeline";
import { isTopic } from "@/lib/knowledge";
import { getEmployee } from "@/lib/session";

export const maxDuration = 120;

// One file per request, so the browser can show progress per file and a failure stays local.
export async function POST(req: Request) {
  const me = await getEmployee();
  if (!me) return Response.json({ ok: false, error: "צריך להתחבר מחדש" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ ok: false, error: "לא התקבל קובץ" }, { status: 400 });
  if (file.size > MAX_BYTES) return Response.json({ ok: false, error: "הקובץ גדול מ-25MB" }, { status: 413 });
  const clientId = typeof form.get("clientId") === "string" ? (form.get("clientId") as string) : null;

  const bytes = new Uint8Array(await file.arrayBuffer());
  const topic = form.get("topic");
  const result = await ingestFile({ bytes, name: file.name, type: file.type }, me, isTopic(topic) ? null : clientId || null, isTopic(topic) ? { topic } : {});
  // Vectors and summary come after the response, so the upload never waits on the AI.
  if (result.ok && !result.duplicate) after(() => processItem(result.itemId));
  return Response.json(result, { status: result.ok ? 200 : 400 });
}
