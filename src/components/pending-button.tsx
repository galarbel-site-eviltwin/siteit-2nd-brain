"use client";

import { useFormStatus } from "react-dom";

// A submit button that says what is happening while the server works (summaries take a few seconds).
export function PendingButton({ children, pending, className = "btn btn-sm btn-ghost" }: { children: React.ReactNode; pending: string; className?: string }) {
  const { pending: busy } = useFormStatus();
  return (
    <button className={className} disabled={busy} aria-busy={busy}>
      {busy ? <><span className="spin" aria-hidden="true" />{pending}</> : children}
    </button>
  );
}
