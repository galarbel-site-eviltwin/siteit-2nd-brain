import Image from "next/image";
import { ShieldCheck, WarningCircle } from "@phosphor-icons/react/dist/ssr";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";
import { auth, devLoginEnabled, googleConfigured, signIn } from "@/auth";
import { BrainAnim } from "@/components/brain/brain-anim";
import { ThemeToggle } from "@/components/theme-toggle";

const errors: Record<string, string> = {
  AccessDenied: "המייל הזה לא ברשימת העובדים של סייט איט. אם זו טעות, דני יכול להוסיף אותך.",
  inactive: "הגישה שלך הושבתה. אם זו טעות, פנה לדני.",
};

const team = ["galarbel@eviltwin.io", "dani@eviltwin.io", "maya@eviltwin.io", "itay@eviltwin.io", "ben@eviltwin.io"];

async function withAuthErrors(run: () => Promise<unknown>) {
  try {
    await run();
  } catch (e) {
    // signIn signals success by throwing a redirect, so only auth failures are caught here.
    if (e instanceof AuthError) redirect(`/login?error=${e.type === "AccessDenied" ? "AccessDenied" : "failed"}`);
    throw e;
  }
}

async function googleSignIn() {
  "use server";
  await withAuthErrors(() => signIn("google", { redirectTo: "/" }));
}

async function devSignIn(formData: FormData) {
  "use server";
  if (!devLoginEnabled) redirect("/login");
  await withAuthErrors(() => signIn("dev", { email: String(formData.get("email") ?? ""), redirectTo: "/" }));
}

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const session = await auth();
  const { error } = await searchParams;
  if (session && !error) redirect("/");
  const message = typeof error === "string" ? (errors[error] ?? "משהו השתבש בכניסה. נסה שוב.") : null;

  return (
    <main className="login">
      <ThemeToggle className="corner" />
      <section className="login-copy">
        <Image className="logo logo-light" src="/brand/logo.png" priority sizes="320px" alt="SiteIt 2nd Brain" width={1759} height={894} />
        <Image className="logo logo-dark" src="/brand/logo-dark.png" sizes="320px" alt="SiteIt 2nd Brain" width={1759} height={894} />
        <h1>כל מה שסייט איט יודעת. בשאלה אחת.</h1>
        <p className="lead">פגישות, הודעות, הצעות מחיר והחלטות של כל הלקוחות, עם מקור שאפשר לבדוק לכל תשובה.</p>

        {message && (
          <p className="alert" role="alert"><WarningCircle size={22} weight="fill" />{message}</p>
        )}

        <form action={googleSignIn}>
          <button className="btn gbtn" disabled={!googleConfigured}>
            <img src="/brand/google.svg" alt="" width={24} height={24} />
            התחברות עם Google
          </button>
          {!googleConfigured && <p className="muted" style={{ marginTop: 10, fontSize: 15 }}>הכניסה עם Google עוד לא מחוברת.</p>}
        </form>

        {devLoginEnabled && (
          <div className="dev">
            <b>כניסה זמנית, רק במחשב הזה</b>
            <p>עד שהכניסה עם Google תחובר. בודקת את אותה רשימת עובדים, ולא קיימת בגרסה שבענן.</p>
            <form action={devSignIn} className="row">
              {team.map((email) => (
                <button key={email} name="email" value={email} className="btn btn-sm btn-ghost ltr">{email}</button>
              ))}
            </form>
            {/* Separate form: Enter in this field must submit what was typed, not the first button above. */}
            <form action={devSignIn} className="row">
              <label className="sr-only" htmlFor="other">מייל אחר</label>
              <input id="other" name="email" type="email" required placeholder="מייל אחר, כדי לבדוק שנחסם" className="ltr" />
              <button className="btn btn-sm btn-primary">כניסה</button>
            </form>
          </div>
        )}

        <p className="muted" style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 15.5 }}>
          <ShieldCheck size={20} /> הכניסה לעובדי סייט איט בלבד
        </p>
      </section>
      <div className="login-art">
        <BrainAnim label="מוח שקולט מידע מכל המקורות" />
      </div>
    </main>
  );
}
