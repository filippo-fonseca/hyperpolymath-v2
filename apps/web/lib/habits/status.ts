/**
 * Habit progress states — the four-step ladder every habits surface shares.
 *
 * A habit day is no longer binary. `habit_completions.status` already carried
 * the tri-state `'in_progress' | 'almost_done' | 'done'` (migration 0016) with
 * row absence meaning "not started"; this module is the client-side vocabulary
 * for that column, so the /habits page, the dock widget, and the LifeOS tile
 * cannot drift on what a third-filled circle means.
 *
 * Only `done` counts toward streaks and completion rates. Partial states are a
 * record of momentum, not credit: a habit sitting at `almost_done` at midnight
 * broke the streak, same as one never touched. That keeps every existing
 * analytics query (all of which filter `status = 'done'`) honest.
 */

export const HABIT_STATUSES = [
  "not_started",
  "in_progress",
  "almost_done",
  "done",
] as const;

export type HabitStatus = (typeof HABIT_STATUSES)[number];

/** Statuses that get a `habit_completions` row. `not_started` deletes it. */
export type PersistedHabitStatus = Exclude<HabitStatus, "not_started">;

/**
 * Tap order. One control, four states: an empty ring fills a third, then two
 * thirds, then closes into a check, then clears. No menu, no long-press —
 * check-off has to stay one tap for the common case, and "done" is three taps
 * from cold only if you actually walked the ladder.
 */
export function nextHabitStatus(current: HabitStatus): HabitStatus {
  const i = HABIT_STATUSES.indexOf(current);
  return HABIT_STATUSES[(i + 1) % HABIT_STATUSES.length];
}

/** How much of the ring is filled, 0 → 1. */
export function habitStatusRatio(status: HabitStatus): number {
  switch (status) {
    case "in_progress":
      return 1 / 3;
    case "almost_done":
      return 2 / 3;
    case "done":
      return 1;
    default:
      return 0;
  }
}

export const HABIT_STATUS_LABEL: Record<HabitStatus, string> = {
  not_started: "Not started",
  in_progress: "Started",
  almost_done: "Almost done",
  done: "Done",
};

/**
 * The two middle rungs, in ladder order. Every surface that offers a shortcut
 * to partial progress iterates this, so "started" and "almost done" can never
 * appear in different orders on two screens.
 */
export const HABIT_PARTIAL_STATUSES = ["in_progress", "almost_done"] as const;

/** Short chip labels. The row is dense; "Almost done" wraps, "Almost" does not. */
export const HABIT_STATUS_SHORT_LABEL: Record<HabitStatus, string> = {
  not_started: "Clear",
  in_progress: "Started",
  almost_done: "Almost",
  done: "Done",
};

/**
 * Per-status functional ink, matching the task board's grammar (`tasks/status.ts`):
 * a 6px dot and nothing else. Hues track the ladder — neutral, blue, violet,
 * sage — so a habit at "almost done" reads the same as a task at "almost done".
 */
export const HABIT_STATUS_DOT: Record<HabitStatus, string> = {
  not_started: "var(--ink-faint)",
  in_progress: "var(--ink-blue)",
  almost_done: "var(--ink-violet)",
  done: "var(--ink-sage)",
};

/**
 * Craft tint class per rung, for the board's pastel wells. `not_started` stays
 * neutral and falls back to the plain surface, exactly as the task board's
 * "not started" column does.
 */
export const HABIT_STATUS_TINT: Record<HabitStatus, string | null> = {
  not_started: null,
  in_progress: "tint-sky",
  almost_done: "tint-lavender",
  done: "tint-sage",
};

/** Accessible name for the ring button: says where a tap lands next. */
export function habitStatusActionLabel(
  habitName: string,
  current: HabitStatus,
): string {
  const next = nextHabitStatus(current);
  return `${habitName} — ${HABIT_STATUS_LABEL[current]}. Tap to mark ${HABIT_STATUS_LABEL[next].toLowerCase()}.`;
}

/** Narrow an untrusted string (DB text column, wire payload) to a status. */
export function coerceHabitStatus(value: string | null | undefined): HabitStatus {
  return (HABIT_STATUSES as readonly string[]).includes(value ?? "")
    ? (value as HabitStatus)
    : "not_started";
}
