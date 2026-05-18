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

/**
 * Phase 5.1 D-P1 / JARVIS-21 — Drizzle query logger hook.
 *
 * In production this is `undefined` (zero overhead — Drizzle skips the logger
 * call entirely when logger is falsy). In test environments, tests that need
 * to count DB roundtrips can replace the `@/lib/db` module via vi.mock and
 * instrument the mock's select/insert/transaction counts directly (the pattern
 * used by jarvis-perf-budget.test.ts). This exported no-op is included for
 * completeness and documents the hook surface.
 *
 * If a test does NOT mock `@/lib/db`, it can spy on this logger by importing
 * and patching via `setTestLogger` below.
 */
export const dbLogger:
  | { logQuery: (query: string, params: unknown[]) => void }
  | undefined =
  process.env.NODE_ENV === "test"
    ? { logQuery: () => {} } // no-op by default; tests override via vi.mock or setTestLogger
    : undefined;

export const db = drizzle(client, { schema, logger: dbLogger });
