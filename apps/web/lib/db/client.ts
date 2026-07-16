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
// Pool `max` is ENVIRONMENT-AWARE:
//   - On Vercel serverless (`process.env.VERCEL` is set on Vercel builds +
//     runtime) we KEEP `max: 1`. Each invocation is isolated, so a larger
//     per-invocation pool would multiply concurrent connections and exhaust
//     the shared Supavisor pooler. This preserves prod behavior exactly.
//   - On a long-lived process (local dev / self-hosted — NOT Vercel) we use a
//     SMALL pool (`max: 5`). A single connection serializes ALL DB access in
//     the process, so when JARVIS switches MCP tools mid-conversation
//     (e.g. read_imessage → read_whatsapp → send_message) each tool's fresh
//     Postgres read queues behind the turn's other queries (recent-history,
//     user-key, config loads, fact extraction, turn persistence) on one
//     connection. A tiny pool lets those run concurrently and kills the stall.
//
// Timeouts guard against the ~30s intermittent stall from a recycled pooled
// connection: Supavisor drops an idle pooled connection, and the next query
// discovers a dead socket, paying postgres-js's default 30s `connect_timeout`
// to reconnect.
//   - `connect_timeout: 10` fails fast on a dead/unreachable connection so a
//     retry happens in ~10s instead of hanging ~30s.
//   - `idle_timeout: 20` + `max_lifetime: 60 * 30` recycle connections
//     proactively (before Supavisor kills them), so we don't discover a dead
//     socket at query time.

const isVercel = Boolean(process.env.VERCEL);

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
    max: isVercel ? 1 : 5,
    connect_timeout: 10,
    idle_timeout: 20,
    max_lifetime: 60 * 30,
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
