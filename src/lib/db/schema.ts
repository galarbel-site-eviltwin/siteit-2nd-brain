import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid, vector } from "drizzle-orm/pg-core";

// Every AI-written summary points back to the pieces it came from, so a reader can check it.
export type Ref = { item?: string; seq: number };
export type Point = { text: string; refs: Ref[] };
export type ItemSummary = { about: string; points: Point[]; agreed: Point[]; open: Point[]; mood?: Point | null };
export type ClientSummary = { overview: string; now: Point[]; open: Point[]; watch: Point[]; basedOn: number };

export const EMBED_DIMS = 1536;

export const employeeRole = pgEnum("employee_role", ["member", "admin"]);

// Who may sign in. Access is decided by this list, not by the Google domain.
// RLS is enabled with no policies on every table: the Supabase Data API (publishable key)
// sees nothing; only the server, connecting as the database owner, reads them.
export const employees = pgTable("employees", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  role: employeeRole("role").notNull().default("member"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
}).enableRLS();

export const auditLog = pgTable("audit_log", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorEmail: text("actor_email"),
  action: text("action").notNull(),
  detail: jsonb("detail"),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// ---------- clients ----------

export const clientStatus = pgEnum("client_status", ["active", "paused", "archived"]);

export const clients = pgTable("clients", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  status: clientStatus("status").notNull().default("active"),
  services: text("services").array().notNull().default([]), // "seo" | "geo" | "web"
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  notes: text("notes"),
  summary: jsonb("summary").$type<ClientSummary>(),
  summarizedAt: timestamp("summarized_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Names, domains and nicknames that point at a client. Ingestion matches against these
// to *suggest* an assignment; a suggestion is never confirmed without a person.
export const aliasKind = pgEnum("alias_kind", ["name", "domain", "nickname", "phone"]);

export const clientAliases = pgTable(
  "client_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    kind: aliasKind("kind").notNull(),
    value: text("value").notNull(), // normalized: lowercase, no www., digits-only for phones
  },
  (t) => [uniqueIndex("client_aliases_kind_value").on(t.kind, t.value), index("client_aliases_client").on(t.clientId)],
).enableRLS();

export const contacts = pgTable(
  "contacts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clientId: uuid("client_id").notNull().references(() => clients.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role"),
    email: text("email"),
    phone: text("phone"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("contacts_client").on(t.clientId)],
).enableRLS();

// ---------- ingested knowledge ----------

export const itemKind = pgEnum("item_kind", ["meeting", "chat", "document", "voice_note", "note", "email"]);
export const itemSource = pgEnum("item_source", ["timeless", "whatsapp", "upload", "manual", "drive", "zoom", "gmail", "outlook"]);
export const assignmentStatus = pgEnum("assignment_status", ["none", "suggested", "confirmed"]);
// stored = kept, but its content cannot be read yet (audio, images): honest about what was ingested.
export const ingestStatus = pgEnum("ingest_status", ["processing", "ready", "stored", "failed"]);

export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: itemKind("kind").notNull(),
    source: itemSource("source").notNull(),
    title: text("title").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    assignment: assignmentStatus("assignment").notNull().default("none"),
    assignmentReason: text("assignment_reason"),
    // Two clocks: when it happened, and when the brain learned of it.
    occurredAt: timestamp("occurred_at", { withTimezone: true }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    createdBy: uuid("created_by").references(() => employees.id, { onDelete: "set null" }),
    fileName: text("file_name"),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storagePath: text("storage_path"),
    contentHash: text("content_hash"),
    status: ingestStatus("status").notNull().default("processing"),
    error: text("error"),
    participants: text("participants").array().notNull().default([]),
    meta: jsonb("meta"),
    summary: jsonb("summary").$type<ItemSummary>(),
    summarizedAt: timestamp("summarized_at", { withTimezone: true }),
    // Company knowledge (procedures, price lists...) has a topic instead of a client. See lib/knowledge.
    topic: text("topic"),
  },
  (t) => [index("items_client").on(t.clientId), index("items_topic").on(t.topic), index("items_hash").on(t.contentHash), index("items_recorded").on(t.recordedAt)],
).enableRLS();

export const chunks = pgTable(
  "chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    itemId: uuid("item_id").notNull().references(() => items.id, { onDelete: "cascade" }),
    seq: integer("seq").notNull(),
    text: text("text").notNull(),
    speaker: text("speaker"),
    startMs: integer("start_ms"),
    at: timestamp("at", { withTimezone: true }),
    embedding: vector("embedding", { dimensions: EMBED_DIMS }),
  },
  (t) => [
    index("chunks_item").on(t.itemId, t.seq),
    index("chunks_embedding").using("hnsw", t.embedding.op("vector_cosine_ops")),
    // Postgres has no Hebrew dictionary, so word search runs on trigrams.
    index("chunks_trgm").using("gin", sql`${t.text} gin_trgm_ops`),
  ],
).enableRLS();

// ---------- connected sources ----------

// One row per connected source. Tokens are encrypted in the app (lib/crypto) before they reach the database.
export const connections = pgTable("connections", {
  id: uuid("id").primaryKey().defaultRandom(),
  provider: text("provider").notNull().unique(), // "google_drive"
  ownerId: uuid("owner_id").references(() => employees.id, { onDelete: "set null" }),
  accountEmail: text("account_email"),
  tokenEnc: text("token_enc"),
  config: jsonb("config"), // drive: { driveId, rootFolderId, rootName }
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  lastResult: jsonb("last_result"),
  // Lease that keeps two syncs (cron and "sync now") from running at once.
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export const folderStatus = pgEnum("folder_status", ["pending", "mapped", "ignored"]);

// A client folder in the shared Drive. New folders wait for a person to say which client they are.
export const driveFolders = pgTable("drive_folders", {
  folderId: text("folder_id").primaryKey(),
  name: text("name").notNull(),
  rootId: text("root_id"), // which top folder it sits under; that root decides the default services
  domain: text("domain"), // a website found in its file names; "" once looked for and none found
  status: folderStatus("status").notNull().default("pending"),
  clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
  suggestedClientId: uuid("suggested_client_id").references(() => clients.id, { onDelete: "set null" }),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

// Every Drive file the sync has handled, so an edited file replaces its item instead of duplicating it.
export const driveFiles = pgTable(
  "drive_files",
  {
    fileId: text("file_id").primaryKey(),
    folderId: text("folder_id").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    version: text("version"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
    skipped: text("skipped"),
  },
  (t) => [index("drive_files_folder").on(t.folderId)],
).enableRLS();

export type Employee = typeof employees.$inferSelect;
export type Client = typeof clients.$inferSelect;
export type Item = typeof items.$inferSelect;

// ---------- personal accounts (mail and calendar) ----------

export const accountProvider = pgEnum("account_provider", ["google", "microsoft"]);

// Each employee connects their own mailbox and calendar. Only threads with known clients are ever read in full.
export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    provider: accountProvider("provider").notNull(),
    email: text("email").notNull(),
    tokenEnc: text("token_enc").notNull(),
    scopes: text("scopes"),
    // Mail backfill walks pages of the last 12 months, then switches to "since last sync".
    mailState: jsonb("mail_state").$type<{ pageToken?: string | null; backfillDone?: boolean; since?: string | null }>(),
    lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
    lastError: text("last_error"),
    lastResult: jsonb("last_result"),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("accounts_employee_provider").on(t.employeeId, t.provider)],
).enableRLS();

// One mail thread is one item; the thread grows, the item is rebuilt.
export const mailThreads = pgTable(
  "mail_threads",
  {
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    threadId: text("thread_id").notNull(),
    itemId: uuid("item_id").references(() => items.id, { onDelete: "set null" }),
    messageCount: integer("message_count").notNull().default(0),
    historyId: text("history_id"),
    skipped: text("skipped"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("mail_threads_key").on(t.accountId, t.threadId)],
).enableRLS();

// Meetings from the employees' calendars. Only events with someone besides the owner are kept.
export const events = pgTable(
  "events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    accountId: uuid("account_id").notNull().references(() => accounts.id, { onDelete: "cascade" }),
    externalId: text("external_id").notNull(),
    title: text("title").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }).notNull(),
    endAt: timestamp("end_at", { withTimezone: true }),
    allDay: boolean("all_day").notNull().default(false),
    attendees: text("attendees").array().notNull().default([]),
    location: text("location"),
    link: text("link"),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("events_key").on(t.accountId, t.externalId), index("events_start").on(t.startAt), index("events_client").on(t.clientId)],
).enableRLS();

// ---------- personal area ----------

// An employee's own notes. Only the author ever reads them: not other employees, not the brain's answers.
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employeeId: uuid("employee_id").notNull().references(() => employees.id, { onDelete: "cascade" }),
    body: text("body").notNull(),
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "set null" }),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notes_employee").on(t.employeeId, t.pinned, t.updatedAt)],
).enableRLS();
