"use client";

import { Books, Buildings, GearSix, SealCheck, Sparkle, SunHorizon, TrayArrowDown } from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Screens arrive phase by phase (docs/technical-spec.md §10); until then they show when they land.
const items = [
  { href: "/", label: "היום שלי", Icon: SunHorizon },
  { href: null, label: "לקוחות", Icon: Buildings, phase: 1 },
  { href: "/ask", label: "שאל את המוח", Icon: Sparkle },
  { href: null, label: "ידע החברה", Icon: Books, phase: 9 },
  { href: null, label: "קליטת מידע", Icon: TrayArrowDown, phase: 1 },
  { href: null, label: "לבדיקה", Icon: SealCheck, phase: 3 },
] as const;

export function Nav({ isAdmin }: { isAdmin: boolean }) {
  const path = usePathname();
  return (
    <nav className="nav">
      {items.map(({ href, label, Icon, ...rest }) =>
        href ? (
          <Link key={label} href={href} aria-current={path === href ? "page" : undefined}><Icon size={25} />{label}</Link>
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
