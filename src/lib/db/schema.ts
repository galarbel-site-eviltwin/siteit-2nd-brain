import { boolean, index, integer, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

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

export const itemKind = pgEnum("item_kind", ["meeting", "chat", "document", "voice_note", "note"]);
export const itemSource = pgEnum("item_source", ["timeless", "whatsapp", "upload", "manual", "drive"]);
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
  },
  (t) => [index("items_client").on(t.clientId), index("items_hash").on(t.contentHash), index("items_recorded").on(t.recordedAt)],
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
  },
  (t) => [index("chunks_item").on(t.itemId, t.seq)],
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
