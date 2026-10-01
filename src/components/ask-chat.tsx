"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, BookOpenText, MagnifyingGlass, Sparkle, X } from "@phosphor-icons/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import Link from "next/link";
import { Fragment, useMemo, useState } from "react";

type Src = { ref: string; itemId: string; seq: number; title: string; what: string; when: string | null; client: string | null; speaker: string | null; text: string };
type Option = { id: string; name: string };

const STARTERS = [
  "מה הלקוח ביקש בשיחה האחרונה?",
  "על מה סיכמנו לגבי מחיר?",
  "מה פתוח מול הלקוח כרגע?",
  "האם הלקוח הביע חוסר שביעות רצון?",
];

const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "");

// Every source any tool returned in this conversation, by its short ref.
function collectSources(messages: UIMessage[]) {
  const map = new Map<string, Src>();
  for (const m of messages) for (const p of m.parts) {
    if (p.type === "tool-search_sources" && "output" in p && p.output) for (const s of (p.output as { sources: Src[] }).sources) map.set(s.ref, s);
  }
  return map;
}

// Light formatting: paragraphs, "- " bullets, **bold**, and [#ref] citations as numbered chips.
function Answer({ text, sources, order, onOpen }: { text: string; sources: Map<string, Src>; order: string[]; onOpen: (s: Src) => void }) {
  const inline = (line: string, key: string) =>
    line.split(/(\[#[0-9a-f]{8}\]|\*\*[^*]+\*\*)/g).map((part, i) => {
      const cite = part.match(/^\[#([0-9a-f]{8})\]$/);
      if (cite) {
        const s = sources.get(cite[1]);
        if (!s) return null; // a ref that no tool returned is not shown: the answer cannot cite what it did not read
        if (!order.includes(cite[1])) order.push(cite[1]);
        return <button key={`${key}-${i}`} type="button" className="ref" onClick={() => onOpen(s)} title={s.title}>{order.indexOf(cite[1]) + 1}</button>;
      }
      if (/^\*\*[^*]+\*\*$/.test(part)) return <b key={`${key}-${i}`}>{part.slice(2, -2)}</b>;
      return <Fragment key={`${key}-${i}`}>{part}</Fragment>;
    });
  const blocks = text.trim().split(/\n{2,}/);
  return (
    <>
      {blocks.map((b, bi) => {
        const lines = b.split("\n");
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*•]\s+/, ""), `${bi}-${li}`)}</li>)}</ul>;
        return <p key={bi}>{lines.map((l, li) => <Fragment key={li}>{li > 0 && <br />}{inline(l.replace(/^#+\s*/, ""), `${bi}-${li}`)}</Fragment>)}</p>;
      })}
    </>
  );
}

// Pieces of the same chat or meeting shown together, in the order the search ranked them.
function groupByItem(list: Src[]) {
  const groups: { itemId: string; title: string; what: string; client: string | null; items: Src[] }[] = [];
  for (const s of list) {
    const g = groups.find((x) => x.itemId === s.itemId);
    if (g) g.items.push(s);
    else groups.push({ itemId: s.itemId, title: s.title, what: s.what, client: s.client, items: [s] });
  }
  return groups;
}

const TOOL_LABEL: Record<string, string> = { "tool-search_sources": "מחפש במקורות", "tool-client_timeline": "עובר על ציר הזמן של הלקוח", "tool-find_client": "מאתר את הלקוח" };

export function AskChat({ clients, initialClient }: { clients: Option[]; initialClient: string | null }) {
  const [clientId, setClientId] = useState(initialClient ?? "");
  const [mode, setMode] = useState<"answer" | "sources">("answer");
  const [input, setInput] = useState("");
  const [open, setOpen] = useState<Src | null>(null);
  const [found, setFound] = useState<{ q: string; client: { id: string; name: string } | null; sources: Src[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const { messages, sendMessage, status, error, setMessages } = useChat({
    transport: new DefaultChatTransport({ api: "/api/ask" }),
  });
  const sources = useMemo(() => collectSources(messages), [messages]);
  const busy = status === "submitted" || status === "streaming";
  const started = messages.length > 0 || found;

  async function ask(q: string) {
    q = q.trim();
    if (!q || busy) return;
    setInput("");
    if (mode === "sources") {
      setSearching(true);
      try {
        const r = await fetch(`/api/search?${new URLSearchParams({ q, clientId })}`);
        const j = await r.json();
        setFound({ q, client: j.client ?? null, sources: (j.sources ?? []).map((s: Src & { itemId: string; at: string | null; occurredAt: string | null; clientName: string | null }) => ({ ...s, when: s.at ?? s.occurredAt, client: s.clientName })) });
      } finally { setSearching(false); }
      return;
    }
    setFound(null);
    sendMessage({ text: q }, { body: { clientId: clientId || null } });
  }

  return (
    <div className={`ask ${started ? "is-started" : ""}`}>
      <div className="ask-controls">
        <label className="ask-scope">
          <span>היקף</span>
          <select value={clientId} onChange={(e) => { setClientId(e.target.value); setMessages([]); setFound(null); }}>
            <option value="">כל הלקוחות</option>
            <option value="company">ידע החברה</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="seg" role="radiogroup" aria-label="סוג תשובה">
          <button type="button" role="radio" aria-checked={mode === "answer"} onClick={() => setMode("answer")}><Sparkle size={16} weight="fill" />תשובה מהמוח</button>
          <button type="button" role="radio" aria-checked={mode === "sources"} onClick={() => setMode("sources")}><BookOpenText size={16} />מקורות בלבד</button>
        </div>
        {(messages.length > 0 || found) && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { setMessages([]); setFound(null); }}>שיחה חדשה</button>}
      </div>

      {!started && (
        <div className="starters">
          {STARTERS.map((s) => <button key={s} type="button" className="starter" onClick={() => ask(s)}>{s}</button>)}
        </div>
      )}

      <div className="thread" aria-live="polite">
        {messages.map((m) => {
          const order: string[] = [];
          return m.role === "user" ? (
            <div key={m.id} className="bubble me">{m.parts.map((p, i) => (p.type === "text" ? <span key={i}>{p.text}</span> : null))}</div>
          ) : (
            <div key={m.id} className="bubble brain">
              {m.parts.map((p, i) => {
                if (p.type === "text") return <div key={i} className="answer"><Answer text={p.text} sources={sources} order={order} onOpen={setOpen} /></div>;
                if (p.type.startsWith("tool-") && "state" in p && p.state !== "output-available" && p.state !== "output-error")
                  return <div key={i} className="tool-step"><span className="spin" aria-hidden="true" />{TOOL_LABEL[p.type] ?? "חושב"}...</div>;
                return null;
              })}
              {order.length > 0 && (
                <div className="cited">
                  {order.map((r, n) => { const s = sources.get(r)!; return <button key={r} type="button" className="cite-row" onClick={() => setOpen(s)}><span className="ref">{n + 1}</span><span>{s.title}</span><span className="muted small">{s.what}{s.when ? `, ${day(s.when)}` : ""}</span></button>; })}
                </div>
              )}
            </div>
          );
        })}
        {status === "submitted" && <div className="bubble brain"><div className="tool-step"><span className="spin" aria-hidden="true" />המוח חושב...</div></div>}
        {error && <p className="alert" role="alert">{error.message && /[א-ת]/.test(error.message) ? error.message : "המוח לא הצליח לענות כרגע. אפשר לנסות שוב בעוד רגע."}</p>}

        {found && (
          <div className="bubble brain">
            <p className="muted small found-note">
              {found.client && <>חיפשתי רק אצל <b>{found.client.name}</b>. </>}
              {found.sources.length ? `${found.sources.length} קטעים מקוריים, בלי סיכום. לתשובה מסוכמת עוברים ל"תשובה מהמוח".` : `לא נמצאו קטעים שמתאימים ל"${found.q}".`}
            </p>
            {groupByItem(found.sources).map((g) => (
              <div key={g.itemId} className="found-group">
                <Link href={`/items/${g.itemId}`} className="found-title"><b>{g.title}</b><span className="muted small">{g.what}{g.client && !found.client ? `, ${g.client}` : ""}</span></Link>
                <div className="cited">
                  {g.items.map((s) => (
                    <button key={s.ref} type="button" className="cite-row tall" onClick={() => setOpen(s)}>
                      {s.when && <span className="muted small">{day(s.when)}</span>}
                      <span className="snip">{s.text.slice(0, 240)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <form className="ask-box live" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
        {mode === "answer" ? <Sparkle size={26} weight="duotone" /> : <MagnifyingGlass size={26} />}
        <label className="sr-only" htmlFor="q">שאלה למוח</label>
        <input id="q" value={input} onChange={(e) => setInput(e.target.value)} placeholder={mode === "answer" ? "שאל על לקוח, פגישה, מחיר או החלטה..." : "חיפוש במקורות..."} autoComplete="off" />
        <button type="submit" disabled={!input.trim() || busy || searching} aria-label="שליחה"><ArrowUp size={22} weight="bold" /></button>
      </form>

      {open && (
        <aside className="src-panel" role="dialog" aria-label="מקור">
          <div className="src-head">
            <div><b>{open.title}</b><span className="muted small">{open.what}{open.when ? `, ${day(open.when)}` : ""}{open.client ? `, ${open.client}` : ""}</span></div>
            <button type="button" className="icon-btn" aria-label="סגירה" onClick={() => setOpen(null)}><X size={20} /></button>
          </div>
          {open.speaker && <p className="muted small">{open.speaker}</p>}
          <p className="src-text">{open.text}</p>
          <Link className="btn btn-sm btn-ghost" href={`/items/${open.itemId}#c${open.seq}`}>פתיחת הפריט המלא</Link>
        </aside>
      )}
    </div>
  );
}
