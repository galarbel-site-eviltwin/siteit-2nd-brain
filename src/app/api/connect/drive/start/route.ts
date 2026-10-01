import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { authUrl } from "@/lib/drive/google";
import { getEmployee } from "@/lib/session";

// Starts the one-time Drive grant. The state cookie ties Google's answer back to this browser.
export async function GET(req: Request) {
  const me = await getEmployee();
  if (!me) return Response.redirect(new URL("/login", req.url), 302);
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set("drive_oauth_state", state, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 600 });
  return Response.redirect(authUrl(new URL(req.url).origin, state), 302);
}
