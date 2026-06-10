/**
 * Snapshot loader: habits + current streak.
 *
 * All non-archived habits (small set; no cap). Current streak is computed
 * from habit_completions trailing back from today: walk N consecutive days
 * of completion (status = 'done'), stop at the first gap.
 *
 * This is the simplest correct interpretation: gives the agent "how long
 * have I been keeping this up" without requiring per-day-of-week schedule
 * math. The exposed field is `currentStreak` (days), matching the type
 * contract in types.ts.
 */

import { and, asc, desc, eq, isNull } from "drizzle-orm";
import { db as defaultDb } from "@/lib/db";
import { habits as habitsTable, habitCompletions } from "@/lib/db/schema";
import type { Node } from "../types";

export type DB = typeof defaultDb;

function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function daysFromTodayBackwards(rawDates: string[]): number {
  const seen = new Set(rawDates);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // walk backwards while consecutive days have a completion row.
  while (seen.has(ymdLocal(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function loadHabits(
  userId: string,
  db: DB = defaultDb,
): Promise<{ nodes: Node[]; excluded: number }> {
  const rows = await db
    .select({
      id: habitsTable.id,
      name: habitsTable.name,
    })
    .from(habitsTable)
    .where(and(eq(habitsTable.userId, userId), isNull(habitsTable.archivedAt)))
    .orderBy(asc(habitsTable.orderIndex));

  if (rows.length === 0) return { nodes: [], excluded: 0 };

  const completionRows = await db
    .select({
      habitId: habitCompletions.habitId,
      completedDate: habitCompletions.completedDate,
      status: habitCompletions.status,
    })
    .from(habitCompletions)
    .where(and(eq(habitCompletions.userId, userId), eq(habitCompletions.status, "done")))
    .orderBy(desc(habitCompletions.completedDate));

  const completionsByHabit = new Map<string, string[]>();
  for (const c of completionRows) {
    const arr = completionsByHabit.get(c.habitId) ?? [];
    // completedDate is a DATE column → driver returns string YYYY-MM-DD already
    arr.push(typeof c.completedDate === "string" ? c.completedDate : ymdLocal(c.completedDate));
    completionsByHabit.set(c.habitId, arr);
  }

  const nodes: Node[] = rows.map((h) => ({
    type: "habit" as const,
    id: h.id,
    name: h.name,
    currentStreak: daysFromTodayBackwards(completionsByHabit.get(h.id) ?? []),
  }));

  return { nodes, excluded: 0 };
}
