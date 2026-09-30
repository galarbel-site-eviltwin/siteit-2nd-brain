import Image from "next/image";
import { signOut } from "@/auth";
import { Nav } from "@/components/nav";
import { ThemeToggle } from "@/components/theme-toggle";
import { requireEmployee } from "@/lib/session";

async function logout() {
  "use server";
  await signOut({ redirectTo: "/login" });
}

const initials = (name: string) => name.split(" ").map((p) => p[0]).slice(0, 2).join("");

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const me = await requireEmployee();
  return (
    <div className="app">
      <aside className="side" aria-label="ניווט ראשי">
        <div className="brand">
          <Image className="logo-light" src="/brand/logo.png" sizes="180px" alt="SiteIt 2nd Brain" width={1759} height={894} />
          <Image className="logo-dark" src="/brand/logo-dark.png" sizes="180px" alt="SiteIt 2nd Brain" width={1759} height={894} />
        </div>
        <Nav isAdmin={me.role === "admin"} />
        <div className="side-foot">
          <div className="me">
            <span className="av">{initials(me.name)}</span>
            <div><b>{me.name}</b><span>{me.role === "admin" ? "מנהל" : "עובד"}</span></div>
            <ThemeToggle />
          </div>
          <form action={logout}><button className="btn btn-sm btn-ghost" style={{ width: "100%" }}>יציאה</button></form>
        </div>
      </aside>
      <header className="topbar">
        <Image src="/brand/mark.png" sizes="40px" alt="SiteIt 2nd Brain" width={724} height={874} />
        <b>{me.name}</b>
        <span className="sp" />
        <ThemeToggle />
        <form action={logout}><button className="btn btn-sm btn-ghost">יציאה</button></form>
      </header>
      <main className="main"><div className="wrap">{children}</div></main>
    </div>
  );
}
