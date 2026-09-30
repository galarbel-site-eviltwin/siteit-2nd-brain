import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { audit, findEmployee, markLogin, normalizeEmail } from "@/lib/employees";

// Temporary sign-in without Google, for building before the Google Cloud app exists.
// Never available in a production build, and never on Vercel, whatever the env says.
export const devLoginEnabled =
  process.env.NODE_ENV === "development" && process.env.AUTH_DEV_LOGIN === "1" && !process.env.VERCEL;

export const googleConfigured = Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET);

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login", error: "/login" },
  providers: [
    Google,
    ...(devLoginEnabled
      ? [
          Credentials({
            id: "dev",
            name: "Dev",
            credentials: { email: {} },
            // Only the email is checked; the allowlist decision happens in signIn below.
            authorize: async (c) => {
              const email = normalizeEmail(String(c?.email ?? ""));
              return email ? { id: email, email } : null;
            },
          }),
        ]
      : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      const email = normalizeEmail(user.email ?? "");
      if (account?.provider === "google" && profile?.email_verified !== true) {
        await audit("login_denied", email || null, { reason: "email_not_verified" });
        return false;
      }
      const employee = await findEmployee(email);
      if (!employee || !employee.active) {
        await audit("login_denied", email || null, { reason: employee ? "inactive" : "not_on_list", provider: account?.provider });
        return false;
      }
      await markLogin(employee.id);
      await audit("login", email, { provider: account?.provider });
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const employee = await findEmployee(user.email);
        if (employee) Object.assign(token, { email: employee.email, name: employee.name, role: employee.role });
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) session.user.role = token.role as "member" | "admin" | undefined;
      return session;
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: { name?: string | null; email?: string | null; image?: string | null; role?: "member" | "admin" };
  }
}
