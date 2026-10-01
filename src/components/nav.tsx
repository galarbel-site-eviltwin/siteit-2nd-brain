"use client";

import { Books, Buildings, PlugsConnected, SealCheck, Sparkle, SunHorizon, TrayArrowDown, UserCircle, UsersThree } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Screens arrive phase by phase (docs/technical-spec.md §10); until then they show when they land.
const items = [
  { href: "/", label: "היום שלי", Icon: SunHorizon },
  { href: "/clients", label: "לקוחות", Icon: Buildings },
  { href: "/ask", label: "שאל את המוח", Icon: Sparkle },
  { href: "/knowledge", label: "ידע החברה", Icon: Books },
  { href: "/ingest", label: "קליטת מידע", Icon: TrayArrowDown },
  { href: null, label: "לבדיקה", Icon: SealCheck, phase: 3 },
  { href: "/me", label: "האזור שלי", Icon: UserCircle },
  { href: "/connections", label: "חיבורים", Icon: PlugsConnected },
  { href: "/team", label: "צוות", Icon: UsersThree },
] as const;

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {items.map(({ href, label, Icon, ...rest }) =>
        href ? (
          <Link key={label} href={href} aria-current={(href === "/" ? path === "/" : path.startsWith(href)) ? "page" : undefined}><Icon size={25} />{label}</Link>
        ) : (
          <span key={label} aria-disabled="true"><Icon size={25} />{label}<em className="soon">שלב {"phase" in rest ? rest.phase : ""}</em></span>
        ),
      )}
    </nav>
  );
}
