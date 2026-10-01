import { cookies } from "next/headers";
import { after } from "next/server";
import { me as graphMe, msAccountFor, msExchange, saveMsAccount } from "@/lib/accounts/microsoft";
import { syncAccount } from "@/lib/accounts/sync";
import { audit } from "@/lib/employees";
import { getEmployee } from "@/lib/session";

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/connections?${q}`, url.origin), 302);
  const me = await getEmployee();
  if (!me) return Response.redirect(new URL("/login", url.origin), 302);

  const jar = await cookies();
  const expected = jar.get("ms_oauth_state")?.value;
  jar.delete("ms_oauth_state");
  if (url.searchParams.get("error")) return back("error=denied");
  if (!expected || url.searchParams.get("state") !== expected) return back("error=exchange");

  try {
    const t = await msExchange(url.searchParams.get("code") ?? "", url.origin);
    if (!/Mail\.Read/i.test(t.scope) || !/Calendars\.Read/i.test(t.scope)) return back("error=scope");
    if (!t.refresh_token) return back("error=refresh");
    const who = await graphMe(t.access_token);
    const email = (who.mail || who.userPrincipalName).toLowerCase();
    await saveMsAccount(me.id, email, t.refresh_token, t.scope);
    await audit("mail_connected", me.email, { provider: "microsoft", account: email });
    const acc = await msAccountFor(me.id);
    if (acc) after(() => syncAccount(acc, 200_000, 60).then(() => undefined));
    return back("connected=microsoft");
  } catch (e) {
    console.error("microsoft connect failed", e);
    return back("error=exchange");
  }
}
