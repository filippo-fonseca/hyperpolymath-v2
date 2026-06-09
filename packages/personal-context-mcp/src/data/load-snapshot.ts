/**
 * Loader callback interfaces — the MCP package never touches the database
 * directly (zero coupling to apps/web). The caller (apps/web's MCP route
 * handler, Plan 04) supplies DB-backed implementations via dependency
 * injection on createPersonalContextServer().
 *
 * Keeping these as plain TypeScript types (not Zod schemas) is intentional:
 * the inputs are simple primitives (userId, days) and the outputs are the
 * already-Zod-validated ContextSnapshot / SnapshotHistoryEntry types from
 * ./types.ts. No further runtime validation needed at the loader boundary.
 */

import type { ContextSnapshot, SnapshotHistoryEntry } from "../types.js";

/**
 * Loads the most recent personal-context snapshot for a user.
 * Returns null when the user has no snapshots yet (e.g., before the first
 * cron run, or before a hand-rebuild). The tool handler converts this null
 * into a user-friendly "No snapshot available yet." MCP response.
 */
export type LoadSnapshot = (userId: string) => Promise<ContextSnapshot | null>;

/**
 * Loads metadata-only history for the last `days` snapshots (1..30).
 * The handler-side Zod schema enforces the 1..30 range, so by the time
 * this loader is invoked the `days` value is already in-range.
 *
 * MUST NOT include the nodes/edges arrays — those go through the
 * SnapshotHistoryEntry projection only.
 */
export type LoadHistory = (userId: string, days: number) => Promise<SnapshotHistoryEntry[]>;
