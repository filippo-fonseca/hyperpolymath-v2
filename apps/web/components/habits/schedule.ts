/**
 * Human label for a 7-element Sun-indexed schedule. Sentence case, plain
 * text — the Manage list renders this instead of the old strip of seven
 * per-day badges.
 */

const SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
/** Mon-first so the work week reads left to right. */
const DISPLAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

export function scheduleLabel(daysOfWeek: readonly boolean[]): string {
  const count = daysOfWeek.filter(Boolean).length;
  if (count === 7) return "Every day";
  if (count === 0) return "No days";

  const weekdays = [1, 2, 3, 4, 5].every((i) => daysOfWeek[i]);
  const weekend = daysOfWeek[0] && daysOfWeek[6];
  if (count === 5 && weekdays) return "Weekdays";
  if (count === 2 && weekend) return "Weekends";

  return DISPLAY_ORDER.filter((i) => daysOfWeek[i])
    .map((i) => SHORT[i])
    .join(", ");
}
