import { and, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { jarvisEvents } from "@/lib/db/schema";

/**
 * Phase 6 Plan 06-04: /insights aggregation queries (RES-06, D-04).
 *
 * 7-day window. No filter UI (D-04). All computation server-side from a
 * single SELECT — recharts components receive pre-shaped data and just render.
 *
 * Aggregations:
 *   - actionDist: count of each tool name across all actionTypes arrays
 *     (one turn may have multiple tools — each contributes 1 to its bucket)
 *   - latencyByDay: p50 + p95 of latencyMs bucketed by day-of-week
 *   - errorRate: ratio of error-non-null turns to total, plus per-day sparkline
 *
 * Percentile algorithm: nearest-rank (sort ascending, index = floor(n * p)).
 * Simple, deterministic, no interpolation — fine for diagnostic surface where
 * "is latency degrading?" matters more than statistical rigor.
 */
export interface InsightsData {
  actionDist: Array<{ type: string; count: number }>;
  latencyByDay: Array<{ day: string; p50: number | null; p95: number | null }>;
  errorRate: {
    rate: number;
    totalTurns: number;
    errorTurns: number;
    sparkline: Array<{ day: string; errors: number }>;
  };
  totalTurns: number;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)] ?? null;
}

export async function getInsightsData(userId: string): Promise<InsightsData> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const events = await db
    .select({
      createdAt: jarvisEvents.createdAt,
      actionTypes: jarvisEvents.actionTypes,
      latencyMs: jarvisEvents.latencyMs,
      error: jarvisEvents.error,
    })
    .from(jarvisEvents)
    .where(
      and(eq(jarvisEvents.userId, userId), gte(jarvisEvents.createdAt, since)),
    );

  // 1. Action-type distribution — flatten actionTypes arrays
  const actionCounts = new Map<string, number>();
  for (const e of events) {
    const types = e.actionTypes ?? [];
    for (const t of types) {
      actionCounts.set(t, (actionCounts.get(t) ?? 0) + 1);
    }
  }
  const actionDist = Array.from(actionCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  // 2. Latency by day (last 7 days, bucketed Sun..Sat by day-of-week of createdAt)
  const latenciesByDay = new Map<string, number[]>();
  for (const day of DAY_LABELS) latenciesByDay.set(day, []);
  for (const e of events) {
    if (typeof e.latencyMs !== "number") continue;
    const dayLabel = DAY_LABELS[e.createdAt.getDay()];
    if (!dayLabel) continue;
    latenciesByDay.get(dayLabel)!.push(e.latencyMs);
  }
  const latencyByDay = DAY_LABELS.map((day) => {
    const arr = (latenciesByDay.get(day) ?? []).slice().sort((a, b) => a - b);
    return {
      day,
      p50: percentile(arr, 0.5),
      p95: percentile(arr, 0.95),
    };
  });

  // 3. Error rate + sparkline
  const errorTurns = events.filter(
    (e) => e.error != null && e.error !== "",
  ).length;
  const totalTurns = events.length;
  const rate = totalTurns > 0 ? errorTurns / totalTurns : 0;

  const errorByDay = new Map<string, number>();
  for (const day of DAY_LABELS) errorByDay.set(day, 0);
  for (const e of events) {
    if (e.error != null && e.error !== "") {
      const dayLabel = DAY_LABELS[e.createdAt.getDay()];
      if (!dayLabel) continue;
      errorByDay.set(dayLabel, (errorByDay.get(dayLabel) ?? 0) + 1);
    }
  }
  const sparkline = DAY_LABELS.map((day) => ({
    day,
    errors: errorByDay.get(day) ?? 0,
  }));

  return {
    actionDist,
    latencyByDay,
    errorRate: { rate, totalTurns, errorTurns, sparkline },
    totalTurns,
  };
}
