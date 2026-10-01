import { cookies } from "next/headers";
import { audit } from "@/lib/employees";
import { DRIVE_SCOPE, exchangeCode, saveConnection } from "@/lib/drive/google";
import { getEmployee } from "@/lib/session";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/ingest/drive?${q}`, url.origin), 302);
  const me = await getEmployee();
  if (!me) return Response.redirect(new URL("/login", url.origin), 302);

  const jar = await cookies();
  const expected = jar.get("drive_oauth_state")?.value;
  jar.delete("drive_oauth_state");
  if (url.searchParams.get("error")) return back("error=denied");
  if (!expected || url.searchParams.get("state") !== expected) return back("error=state");

  try {
    const t = await exchangeCode(url.searchParams.get("code") ?? "", url.origin);
    if (!t.scope.includes(DRIVE_SCOPE)) return back("error=scope");
    if (!t.refresh_token) return back("error=refresh");
    const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email as string) : me.email;
    await saveConnection(t.refresh_token, email, me.id);
    await audit("drive_connected", me.email, { account: email });
    return back("connected=1");
  } catch (e) {
    console.error("drive connect failed", e);
    return back("error=exchange");
  }
}
