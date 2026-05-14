/**
 * JARVIS-15 latency telemetry helper — Phase 5 Plan 05-04 Task 3.
 *
 * Queries `jarvis_events` (Plan 05-02 / RES-05) for p50 + p95 first_token_ms
 * and latency_ms across a rolling window. Used by the Plan 05-04 Task 4 smoke
 * checkpoint to numerically verify the JARVIS-15 latency budget:
 *
 *   - p50 first_token_ms < 4000ms (warm cache target)
 *   - p95 first_token_ms < 10000ms (cold-cache tolerance)
 *
 * No PG `percentile_cont` round-trip — the smoke session is bounded (~20-50
 * turns) so TS-side percentile math on the result rows is cheaper than a
 * second query, and keeps the helper portable (PG version-agnostic).
 *
 * Note: the `/insights` chart surface that would visualize this in-app is
 * deferred to Phase 6 (RES-06 belongs to the Polish phase). This helper is
 * exclusively for the verification checkpoint, NOT a user-facing read.
 */

import { and, eq, gt, isNotNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { jarvisEvents } from "@/lib/db/schema";

export interface LatencyStats {
  /** Number of jarvis_events rows in the window with first_token_ms set. */
  count: number;
  first_token_p50: number;
  first_token_p95: number;
  latency_p50: number;
  latency_p95: number;
}

/**
 * Linear-interpolation-free percentile. For each p ∈ (0, 1] returns the
 * value at `ceil(N * p) - 1` in the sorted array. Matches PG's
 * `percentile_disc` semantics (discrete — picks an actual data point) rather
 * than `percentile_cont` (interpolated). For sample sizes < 100 the
 * difference is < 1 sample's worth of latency — well within the JARVIS-15
 * margins.
 */
export function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (p <= 0) return sorted[0] ?? 0;
  if (p >= 1) return sorted[sorted.length - 1] ?? 0;
  const idx = Math.ceil(sorted.length * p) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))] ?? 0;
}

/**
 * Computes latency percentiles across the user's recent `jarvis_events`.
 *
 * @param userId    server-derived (getClaims().sub at the callsite)
 * @param sinceMinutes  rolling window in minutes (e.g. 30 for a smoke session)
 * @returns LatencyStats — p50/p95 first_token + latency, plus count
 */
export async function getLatencyStats(
  userId: string,
  sinceMinutes: number,
): Promise<LatencyStats> {
  const sinceDate = new Date(Date.now() - sinceMinutes * 60 * 1000);

  const rows = await db
    .select({
      firstTokenMs: jarvisEvents.firstTokenMs,
      latencyMs: jarvisEvents.latencyMs,
    })
    .from(jarvisEvents)
    .where(
      and(
        eq(jarvisEvents.userId, userId),
        gt(jarvisEvents.createdAt, sinceDate),
        // Filter out rows where the stream errored before first token —
        // those rows still exist (the executor logs them) but their
        // first_token_ms is NULL and would distort the histogram.
        isNotNull(jarvisEvents.firstTokenMs),
      ),
    );

  const firstToken = rows
    .map((r) => r.firstTokenMs ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  const latency = rows
    .map((r) => r.latencyMs ?? 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  return {
    count: rows.length,
    first_token_p50: percentile(firstToken, 0.5),
    first_token_p95: percentile(firstToken, 0.95),
    latency_p50: percentile(latency, 0.5),
    latency_p95: percentile(latency, 0.95),
  };
}
