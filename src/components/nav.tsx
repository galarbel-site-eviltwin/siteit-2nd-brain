"use client";

import { Books, Buildings, GearSix, PlugsConnected, SealCheck, Sparkle, SunHorizon, TrayArrowDown } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Screens arrive phase by phase (docs/technical-spec.md §10); until then they show when they land.
const items = [
  { href: "/", label: "היום שלי", Icon: SunHorizon },
  { href: "/clients", label: "לקוחות", Icon: Buildings },
  { href: "/ask", label: "שאל את המוח", Icon: Sparkle },
  { href: null, label: "ידע החברה", Icon: Books, phase: 9 },
  { href: "/ingest", label: "קליטת מידע", Icon: TrayArrowDown },
  { href: null, label: "לבדיקה", Icon: SealCheck, phase: 3 },
  { href: "/connections", label: "חיבורים", Icon: PlugsConnected },
] as const;

export function Nav({ isAdmin }: { isAdmin: boolean }) {
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
      {isAdmin && (
        <Link href="/admin" aria-current={path === "/admin" ? "page" : undefined}><GearSix size={25} />ניהול</Link>
      )}
    </nav>
  );
}
