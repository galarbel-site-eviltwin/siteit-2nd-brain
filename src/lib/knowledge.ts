// Company knowledge: documents that belong to the company, not to a client. A topic replaces the client.
export const TOPICS = {
  procedures: "נהלים ותהליכים",
  pricing: "מחירונים והצעות מחיר",
  templates: "תבניות",
  training: "הדרכות ומדריכים",
  company: "חומרי חברה ומיתוג",
  general: "כללי",
} as const;

export type Topic = keyof typeof TOPICS;
export const isTopic = (t: unknown): t is Topic => typeof t === "string" && t in TOPICS;
