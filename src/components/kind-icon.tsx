import { ChatsCircle, FileText, Microphone, NotePencil, Waveform } from "@phosphor-icons/react/dist/ssr";

// Source colors carry meaning across the product: green chats, cyan meetings, yellow documents, pink voice.
const MAP = {
  chat: { Icon: ChatsCircle, src: "wa", label: "שיחת וואטסאפ" },
  meeting: { Icon: Microphone, src: "meet", label: "פגישה" },
  document: { Icon: FileText, src: "doc", label: "מסמך" },
  voice_note: { Icon: Waveform, src: "dec", label: "הקלטה" },
  note: { Icon: NotePencil, src: "brain", label: "הערה" },
} as const;

export type Kind = keyof typeof MAP;
export const kindLabel = (k: Kind) => MAP[k].label;

export function KindIcon({ kind, size = "md" }: { kind: Kind; size?: "sm" | "md" | "lg" }) {
  const { Icon, src } = MAP[kind];
  return (
    <span className={`sq ${size}`} data-src={src} aria-hidden="true">
      <Icon weight="fill" size={size === "sm" ? 18 : size === "lg" ? 28 : 22} />
    </span>
  );
}
