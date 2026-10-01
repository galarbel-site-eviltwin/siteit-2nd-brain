// Words for what the brain pulls out of items. Shared by the review queue, the client page and the meeting brief.
export const FACT_KIND = {
  decision: { label: "החלטה", plural: "החלטות" },
  commitment: { label: "התחייבות", plural: "התחייבויות" },
  price: { label: "מחיר", plural: "מחירים והצעות" },
  deadline: { label: "תאריך יעד", plural: "תאריכי יעד" },
  request: { label: "בקשה", plural: "בקשות" },
} as const;

export const EVIDENCE = {
  explicit: "נאמר במפורש",
  reported: "דיווח של מישהו",
  inferred: "פרשנות של המוח",
} as const;

export const STATUS = {
  auto: "התקבל אוטומטית",
  pending: "מחכה לבדיקה",
  approved: "אושר",
  corrected: "תוקן",
  rejected: "נדחה",
} as const;

export type FactKind = keyof typeof FACT_KIND;
export const isFactKind = (k: unknown): k is FactKind => typeof k === "string" && k in FACT_KIND;

// What a person relies on: everything except what was rejected or still waits for review.
export const TRUSTED = ["auto", "approved", "corrected"] as const;

export const money = (amount?: number | null, currency?: string | null) =>
  amount == null ? "" : `${new Intl.NumberFormat("he-IL").format(amount)} ${currency === "USD" ? "$" : currency === "EUR" ? "€" : "₪"}`;
