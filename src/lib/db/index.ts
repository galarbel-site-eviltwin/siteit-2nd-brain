import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// Supabase transaction pooler (port 6543): prepared statements are not supported there.
// One client per server instance; reused across hot reloads in development.
// Local development uses the session pooler (5432): from this machine 6543 stalls under load (measured, 1.10.2026).
const url = process.env.NODE_ENV === "development" && process.env.DIRECT_DATABASE_URL ? process.env.DIRECT_DATABASE_URL : process.env.DATABASE_URL!;
const globalForDb = globalThis as unknown as { sql?: ReturnType<typeof postgres> };

const sql =
  globalForDb.sql ??
  postgres(url, { prepare: false, max: 3, idle_timeout: 20 });

if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

export const db = drizzle(sql, { schema });
