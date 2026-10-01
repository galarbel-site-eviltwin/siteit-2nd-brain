import { cookies } from "next/headers";
import { after } from "next/server";
import { CAL_SCOPE, MAIL_SCOPE, saveGoogleAccount } from "@/lib/accounts/google";
import { syncAccount } from "@/lib/accounts/sync";
import { audit } from "@/lib/employees";
import { DRIVE_SCOPE, exchangeCode, saveConnection } from "@/lib/drive/google";
import { getEmployee } from "@/lib/session";

export const maxDuration = 300;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const back = (q: string) => Response.redirect(new URL(`/ingest/drive?${q}`, url.origin), 302);
  const me = await getEmployee();
  if (!me) return Response.redirect(new URL("/login", url.origin), 302);

  const jar = await cookies();
  // This address serves two grants: the company Drive, and an employee's own mail and calendar.
  const mailState = jar.get("mail_oauth_state")?.value;
  if (mailState && url.searchParams.get("state") === mailState) return mailCallback(url, me, jar);
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

async function mailCallback(url: URL, me: { id: string; email: string }, jar: Awaited<ReturnType<typeof cookies>>) {
  jar.delete("mail_oauth_state");
  const back = (q: string) => Response.redirect(new URL(`/connections?${q}`, url.origin), 302);
  if (url.searchParams.get("error")) return back("error=denied");
  try {
    const t = await exchangeCode(url.searchParams.get("code") ?? "", url.origin);
    if (!t.scope.includes(MAIL_SCOPE) || !t.scope.includes(CAL_SCOPE)) return back("error=scope");
    if (!t.refresh_token) return back("error=refresh");
    const email = t.id_token ? (JSON.parse(Buffer.from(t.id_token.split(".")[1], "base64url").toString()).email as string) : me.email;
    // Only the employee's own work mailbox, never someone else's.
    if (email.toLowerCase() !== me.email.toLowerCase()) return back("error=other_account");
    await saveGoogleAccount(me.id, email, t.refresh_token, t.scope);
    await audit("mail_connected", me.email, { provider: "google" });
    const { googleAccountFor } = await import("@/lib/accounts/google");
    const acc = await googleAccountFor(me.id);
    if (acc) after(() => syncAccount(acc, 200_000, 60).then(() => undefined));
    return back("connected=google");
  } catch (e) {
    console.error("mail connect failed", e);
    return back("error=exchange");
  }
}
