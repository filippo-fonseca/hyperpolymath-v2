import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

// CRITICAL: `prepare: false` is required for Supabase's Supavisor transaction-mode
// pooler (port 6543) since prepared statements don't persist across pooled
// connections. Safe to keep on the local stack too.
//
// CRITICAL: cache the underlying postgres-js client on `globalThis` so that
// Turbopack HMR reloads in dev don't leak fresh 10-connection pools per
// module reload. Without this, the local Supabase Postgres role exhausts its
// ~97 non-superuser connection slots within ~10 hot reloads and surfaces:
//   PostgresError: remaining connection slots are reserved for roles with
//   the SUPERUSER attribute
//
// `max: 1` is intentional: serverless / per-request handlers should multiplex
// through Supavisor (in prod) or share a tiny pool (in dev). Drizzle queries
// inside a single request are serialized by `postgres-js` automatically.

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

const globalForDb = globalThis as unknown as {
  __pgClient?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__pgClient ??
  postgres(connectionString, {
    prepare: false,
    max: 1,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__pgClient = client;
}

export const db = drizzle(client, { schema });
