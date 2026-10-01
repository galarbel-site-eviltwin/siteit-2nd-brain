"use client";

// Checks or clears every checkbox that belongs to the given form (inputs use the form="" attribute).
export function SelectAll({ formId }: { formId: string }) {
  function toggle() {
    const boxes = [...document.querySelectorAll<HTMLInputElement>(`input[type=checkbox][form="${formId}"]`)];
    const all = boxes.every((b) => b.checked);
    boxes.forEach((b) => (b.checked = !all));
  }
  return <button type="button" className="btn btn-sm btn-ghost" onClick={toggle}>סמן הכל / נקה</button>;
}
