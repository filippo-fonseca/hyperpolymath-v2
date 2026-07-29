/**
 * Snapshot loader: habits + current streak.
 *
 * All non-archived habits (small set; no cap). Current streak comes from the
 * shared `lib/habits/streak.ts` definition — schedule-aware, today forgiven
 * until it is done — so the agent quotes the same number the /habits page and
 * the dock widget display. The exposed field is `currentStreak` (days),
 * matching the type contract in types.ts.
 */

import { db as defaultDb } from "@/lib/db";
import { toISODate, todayISO } from "@/lib/habits/dates";
import { computeHabitStreak, groupCompletedDates } from "@/lib/habits/streak";
import { habitCompletions, habits as habitsTable } from "@/lib/db/schema";
import { and, asc, desc, eq, isNull } from "drizzle-orm";
import type { Node } from "../types";

export type DB = typeof defaultDb;

function ymdLocal(d: Date): string {
  return toISODate(d);
}

export async function loadHabits(
  userId: string,
  db: DB = defaultDb
): Promise<{ nodes: Node[]; excluded: number }> {
  // One wave, not two serial trips. The completions query keys off userId and
  // status alone; it never needed the habit ids, so the await that separated
  // them was buying nothing. On the single-connection pool that Vercel runs,
  // serial round trips cost the sum of their latencies rather than the max, and
  // this helper sits inside the search snapshot, which the app fetches on every
  // cold load and again on every realtime write.
  //
  // The one thing this gives up: a user with no habits now also pays the
  // completions query, where the early return used to skip it. One statement in
  // a case that cannot happen without every habit being archived, against one
  // round trip saved every other time.
  const [rows, completionRows] = await Promise.all([
    db
      .select({
        id: habitsTable.id,
        name: habitsTable.name,
        daysOfWeek: habitsTable.daysOfWeek,
        createdAt: habitsTable.createdAt,
      })
      .from(habitsTable)
      .where(and(eq(habitsTable.userId, userId), isNull(habitsTable.archivedAt)))
      .orderBy(asc(habitsTable.orderIndex)),

    db
      .select({
        habitId: habitCompletions.habitId,
        completedDate: habitCompletions.completedDate,
        status: habitCompletions.status,
      })
      .from(habitCompletions)
      .where(and(eq(habitCompletions.userId, userId), eq(habitCompletions.status, "done")))
      .orderBy(desc(habitCompletions.completedDate)),
  ]);

  if (rows.length === 0) return { nodes: [], excluded: 0 };

  const completionsByHabit = groupCompletedDates(
    completionRows.map((c) => ({
      habitId: c.habitId,
      // completedDate is a DATE column → driver returns string YYYY-MM-DD already
      completedDate:
        typeof c.completedDate === "string" ? c.completedDate : ymdLocal(c.completedDate),
    })),
  );

  const today = todayISO();
  const nodes: Node[] = rows.map((h) => ({
    type: "habit" as const,
    id: h.id,
    name: h.name,
    currentStreak: computeHabitStreak({
      daysOfWeek: h.daysOfWeek,
      createdAtISO: ymdLocal(h.createdAt),
      completed: completionsByHabit.get(h.id) ?? new Set(),
      todayISO: today,
    }).current,
  }));

  return { nodes, excluded: 0 };
}
