import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { mailAuthUrl } from "@/lib/accounts/google";
import { getEmployee } from "@/lib/session";

// Each employee connects their own Gmail and calendar, read-only.
export async function GET(req: Request) {
  const me = await getEmployee();
  if (!me) return Response.redirect(new URL("/login", req.url), 302);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("mail_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(mailAuthUrl(new URL(req.url).origin, state, me.email), 302);
}
