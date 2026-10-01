import { monoColor } from "@/lib/clients";

// A client's face: its site icon when a domain is known, otherwise its first letter on a brand color.
export function ClientMark({ id, name, domain, size = 48 }: { id: string; name: string; domain?: string | null; size?: number }) {
  const letter = name.replace(/^[^\p{L}\p{N}]+/u, "").trim()[0] ?? "?";
  if (domain) {
    return (
      <span className="client-mark logo" style={{ width: size, height: size }}>
        <img src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`} alt="" width={size * 0.62} height={size * 0.62} loading="lazy" />
      </span>
    );
  }
  return <span className="client-mark" style={{ width: size, height: size, background: monoColor(id), fontSize: size * 0.42 }}>{letter}</span>;
}
