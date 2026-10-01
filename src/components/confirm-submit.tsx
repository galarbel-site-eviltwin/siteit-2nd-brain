"use client";

import { Trash } from "@phosphor-icons/react";

// Submits a bulk form only after the person confirms how many items it will touch.
export function ConfirmDelete({ formId, label = "מחיקת המסומנים" }: { formId: string; label?: string }) {
  function onClick(e: React.MouseEvent<HTMLButtonElement>) {
    const n = document.querySelectorAll(`input[type=checkbox][form="${formId}"]:checked`).length;
    if (!n) { e.preventDefault(); alert("לא סומן אף פריט"); return; }
    if (!confirm(`למחוק ${n} פריטים מהמוח? הניתוח והקטעים שלהם יימחקו. קבצים ב-Google Drive לא נפגעים.`)) e.preventDefault();
  }
  return (
    <button type="submit" form={formId} className="btn btn-sm btn-danger" onClick={onClick}>
      <Trash size={18} />{label}
    </button>
  );
}
