"use client";

import { CheckCircle, CloudArrowUp, Copy, Spinner, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

type Row = { key: string; name: string; state: "waiting" | "uploading" | "done" | "duplicate" | "error"; itemId?: string; error?: string };

const ACCEPT = ".txt,.zip,.docx,.pdf,.md,.csv,.vtt,.srt,.m4a,.mp3,.wav,.ogg,.opus,.png,.jpg,.jpeg,.webp";

export function Dropzone({ clientId, topic, compact = false, label }: { clientId?: string; topic?: string; compact?: boolean; label?: string }) {
  const [over, setOver] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  async function send(files: File[]) {
    const batch = files.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
    setRows((rs) => [...batch.map((b) => ({ key: b.key, name: b.file.name, state: "waiting" as const })), ...rs]);
    // One at a time: keeps each request small and makes a failure point at a single file.
    for (const { file, key } of batch) {
      patch(key, { state: "uploading" });
      try {
        const body = new FormData();
        body.append("file", file);
        if (clientId) body.append("clientId", clientId);
        if (topic) body.append("topic", topic);
        const res = await fetch("/api/ingest", { method: "POST", body });
        const json = await res.json().catch(() => ({ ok: false, error: "תשובה לא צפויה מהשרת" }));
        if (!json.ok) patch(key, { state: "error", error: json.error });
        else patch(key, { state: json.duplicate ? "duplicate" : "done", itemId: json.itemId });
      } catch {
        patch(key, { state: "error", error: "אין חיבור לשרת. נסה שוב" });
      }
      router.refresh();
    }
  }

  return (
    <div>
      <label
        className={`drop ${over ? "over" : ""} ${compact ? "compact" : ""}`}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); send([...e.dataTransfer.files]); }}
      >
        <span className="drop-ic"><CloudArrowUp weight="bold" size={compact ? 32 : 48} /></span>
        <b>{label ?? (compact ? "גרור לכאן קבצים של הלקוח הזה" : "גרור לכאן ייצוא וואטסאפ, תמלול או מסמך")}</b>
        <span className="muted">או לחץ כדי לבחור. אפשר כמה קבצים ביחד, עד 25MB לקובץ.</span>
        <input ref={input} type="file" multiple accept={ACCEPT} className="sr-only" onChange={(e) => { send([...(e.target.files ?? [])]); e.target.value = ""; }} />
      </label>

      {rows.length > 0 && (
        <ul className="uploads" aria-live="polite">
          {rows.map((r) => (
            <li key={r.key} data-state={r.state}>
              {r.state === "uploading" || r.state === "waiting" ? <Spinner className="spin" size={20} /> : r.state === "error" ? <WarningCircle weight="fill" size={20} /> : r.state === "duplicate" ? <Copy size={20} /> : <CheckCircle weight="fill" size={20} />}
              <span className="ltr name">{r.name}</span>
              <span className="state">
                {r.state === "waiting" && "ממתין"}
                {r.state === "uploading" && "מעבד..."}
                {r.state === "error" && r.error}
                {r.state === "duplicate" && <>כבר נקלט. <Link href={`/items/${r.itemId}`}>לפריט הקיים</Link></>}
                {r.state === "done" && <Link href={`/items/${r.itemId}`}>נקלט. לצפייה</Link>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
