// What an item is, in words a person reads at a glance, and the icon that goes with it.
// Kind says what it is (chat, meeting...), source says where it came from (WhatsApp, Timeless, Zoom...).
export type ItemKind = "meeting" | "chat" | "document" | "voice_note" | "note";
export type ItemSource = "timeless" | "whatsapp" | "upload" | "manual" | "drive" | "zoom";

const ICONS = {
  whatsapp: "/brand/icons/whatsapp.webp",
  timeless: "/brand/icons/timeless.webp",
  zoom: "/brand/icons/zoom.svg",
  recording: "/brand/icons/recordings-images.webp",
  document: "/brand/icons/document.webp",
} as const;

export function describe(kind: ItemKind, source: ItemSource): { label: string; icon: string | null } {
  if (kind === "chat") return { label: "שיחת וואטסאפ", icon: ICONS.whatsapp };
  if (kind === "meeting") {
    if (source === "timeless") return { label: "תמלול פגישה מ-Timeless", icon: ICONS.timeless };
    if (source === "zoom") return { label: "תמלול פגישת Zoom", icon: ICONS.zoom };
    return { label: "תמלול פגישה", icon: ICONS.timeless };
  }
  if (kind === "voice_note") return source === "zoom" ? { label: "הקלטת Zoom", icon: ICONS.zoom } : { label: "הקלטה", icon: ICONS.recording };
  if (kind === "note") return { label: "הערה", icon: null };
  return { label: "מסמך", icon: ICONS.document };
}

// How it reached the brain, separate from what it is.
export function arrival(source: ItemSource, link?: string | null) {
  if (link || source === "drive") return "מ-Google Drive";
  if (source === "manual") return "הוזן ידנית";
  return "הועלה ידנית";
}
