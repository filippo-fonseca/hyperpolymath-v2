import { addDaysISO, dayOfWeekISO } from "./dates";

/**
 * The one streak definition (D12). Every surface that says "streak" — the
 * /habits page, the habits dock widget, analytics, the Kiwi context snapshot —
 * calls this function, so the same habit can never report two different
 * numbers.
 *
 * Semantics, chosen deliberately and recorded in the u11 unit report:
 *
 *  - **Schedule-aware.** Only days the habit is scheduled can extend or break
 *    a streak. Unscheduled days are transparent: a Mon/Wed/Fri habit loses
 *    nothing over the weekend. A completion logged on an unscheduled day
 *    neither counts nor breaks.
 *  - **Today is forgiven.** An unchecked today never breaks the chain (the old
 *    analytics variant showed 0 every morning, which is the opposite of
 *    reinforcement), and it is not counted until it is done. `base` excludes
 *    today entirely; `current` adds today's credit when today is scheduled and
 *    completed, so day one of a new habit reads 1 the moment it is checked.
 *  - **Bounded honestly.** The walk stops at the habit's creation date, and at
 *    the edge of the completions window the caller actually fetched: when an
 *    unbroken run exhausts the window, `saturated` is true and the number is a
 *    floor rather than a silently wrong value (the old page hard-capped at 14).
 */

export type StreakInput = {
  /** 7-element schedule, Sun = 0 → Sat = 6 (matches `Date.getDay()`). */
  daysOfWeek: readonly boolean[];
  /** Local ISO date the habit was created; the walk never goes earlier. */
  createdAtISO: string;
  /** Local ISO dates that carry a done completion for this habit. */
  completed: ReadonlySet<string>;
  todayISO: string;
  /**
   * Earliest date `completed` covers. Omit when the set covers the habit's
   * whole life (then only `createdAtISO` bounds the walk).
   */
  windowStartISO?: string;
};

export type StreakResult = {
  /** Consecutive scheduled-and-done days, ending strictly before today. */
  base: number;
  /** `base` plus today's credit when today is scheduled and completed. */
  current: number;
  /** True when the walk ran out of fetched window while still unbroken. */
  saturated: boolean;
};

export function computeHabitStreak(input: StreakInput): StreakResult {
  const { daysOfWeek, createdAtISO, completed, todayISO, windowStartISO } = input;

  let base = 0;
  let saturated = false;
  let cursor = addDaysISO(todayISO, -1);

  while (cursor >= createdAtISO) {
    if (windowStartISO !== undefined && cursor < windowStartISO) {
      // Unbroken so far, but the fetched data ends here. The true streak may
      // extend further back; report what we know and flag it.
      saturated = true;
      break;
    }
    if (daysOfWeek[dayOfWeekISO(cursor)]) {
      if (completed.has(cursor)) base += 1;
      else break;
    }
    cursor = addDaysISO(cursor, -1);
  }

  const todayCredit =
    daysOfWeek[dayOfWeekISO(todayISO)] && completed.has(todayISO) ? 1 : 0;

  return { base, current: base + todayCredit, saturated };
}

/**
 * Group completion rows into per-habit date sets, the shape `computeHabitStreak`
 * consumes. Rows whose status is not `done` must be filtered out by the caller
 * (or never fetched); this helper is shape-only on purpose.
 */
export function groupCompletedDates(
  rows: readonly { habitId: string; completedDate: string }[],
): Map<string, Set<string>> {
  const byHabit = new Map<string, Set<string>>();
  for (const row of rows) {
    let set = byHabit.get(row.habitId);
    if (!set) {
      set = new Set();
      byHabit.set(row.habitId, set);
    }
    set.add(row.completedDate);
  }
  return byHabit;
}
