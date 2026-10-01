import { NotePencil } from "@phosphor-icons/react/dist/ssr";
import { describe, type ItemKind, type ItemSource } from "@/lib/item-label";

export type Kind = ItemKind;
export const kindLabel = (k: ItemKind, source: ItemSource = "upload") => describe(k, source).label;

// The source's own icon (WhatsApp, Timeless, Zoom...), so a glance says where something came from.
export function KindIcon({ kind, source = "upload", size = "md" }: { kind: ItemKind; source?: ItemSource; size?: "sm" | "md" | "lg" }) {
  const { icon, label } = describe(kind, source);
  const px = size === "sm" ? 34 : size === "lg" ? 60 : 44;
  if (!icon) {
    return (
      <span className={`sq ${size}`} data-src="brain" aria-hidden="true">
        <NotePencil weight="fill" size={size === "sm" ? 18 : size === "lg" ? 28 : 22} />
      </span>
    );
  }
  return (
    <span className={`sq ${size} brand-ic`} title={label} aria-hidden="true">
      {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon, no optimization needed */}
      <img src={icon} alt="" width={px} height={px} />
    </span>
  );
}
