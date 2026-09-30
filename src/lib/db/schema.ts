import { boolean, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const employeeRole = pgEnum("employee_role", ["member", "admin"]);

// Who may sign in. Access is decided by this list, not by the Google domain.
// RLS is enabled with no policies: the Supabase Data API (publishable key) sees nothing;
// only the server, connecting as the database owner, reads these tables.
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

export type Employee = typeof employees.$inferSelect;
