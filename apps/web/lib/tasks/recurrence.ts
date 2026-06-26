import { addDays, format, parseISO } from "date-fns";
import { z } from "zod";

/**
 * Recurring TASKS (issue #144) — DISTINCT from Habits.
 *
 * Habits (components/habits/**) model behaviors tracked on a habit-loop with a
 * `days_of_week` boolean[7] mask and per-day completion logs / streaks. Recurring
 * tasks are NOT that: they are concrete, single-instance to-dos that re-spawn on a
 * cadence. There is no streak, no per-day grid, no "missed = broken chain". A
 * recurring task is just one live `tasks` row carrying a recurrence rule whose
 * due_date is advanced to the next occurrence whenever the current one is
 * completed or explicitly skipped.
 *
 * Model: a single template row = the whole series. We never precompute infinite
 * future instances. The row always represents the *next* occurrence. Completing
 * it advances the date instead of marking it permanently done.
 */

/** Frequency of a recurring task. `custom` = "every N days". */
export type RecurrenceFrequency = "daily" | "weekly" | "custom";

/**
 * Persisted recurrence rule (stored as `tasks.recurrence` jsonb; NULL = one-off).
 *
 * - daily:  every `interval` days (interval defaults to 1).
 * - custom: every `interval` days (interval >= 1; the explicit-N variant of daily).
 * - weekly: on the weekdays listed in `weekdays` (0 = Sunday … 6 = Saturday),
 *           repeating every `interval` weeks. Empty/absent `weekdays` falls back
 *           to the anchor date's weekday.
 */
export interface RecurrenceRule {
  frequency: RecurrenceFrequency;
  /** Repeat every N units (days for daily/custom, weeks for weekly). >= 1. */
  interval: number;
  /** Weekly only: ISO-ish 0..6 (Sun..Sat). Sorted ascending, deduped. */
  weekdays?: number[];
}

/**
 * Zod schema for the recurrence rule — used by server actions to validate input.
 * An empty/absent `weekdays` on a weekly rule is permitted (the computation falls
 * back to the anchor date's weekday); callers should pass it through normalizeRule
 * before persisting.
 */
export const RecurrenceRuleSchema = z.object({
  frequency: z.enum(["daily", "weekly", "custom"]),
  interval: z.number().int().min(1).max(365).default(1),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
});

/**
 * Normalize a rule: clamp interval, sort+dedupe weekdays, drop weekdays for
 * non-weekly frequencies. Returns a clean rule safe to persist.
 */
export function normalizeRule(rule: RecurrenceRule): RecurrenceRule {
  const interval = Math.min(365, Math.max(1, Math.round(rule.interval || 1)));
  if (rule.frequency === "weekly") {
    const weekdays = Array.from(new Set((rule.weekdays ?? []).filter((d) => d >= 0 && d <= 6))).sort(
      (a, b) => a - b,
    );
    return { frequency: "weekly", interval, weekdays };
  }
  return { frequency: rule.frequency, interval };
}

/** Parse a YYYY-MM-DD string as a LOCAL-midnight Date (matches TaskCard convention). */
function parseYmd(ymd: string): Date {
  return parseISO(`${ymd}T00:00:00`);
}

/** Format a Date back to a YYYY-MM-DD string. */
function toYmd(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Compute the next occurrence date strictly AFTER `from` for a given rule.
 *
 * `from` is the YYYY-MM-DD the current occurrence was due (or today's date if the
 * task has no due date). Always returns a date > `from`. For weekly rules this
 * walks forward to the next selected weekday; for daily/custom it adds `interval`
 * days. The walk is bounded so a malformed rule can never loop forever.
 */
export function nextOccurrence(rule: RecurrenceRule, from: string): string {
  const r = normalizeRule(rule);
  const start = parseYmd(from);

  if (r.frequency === "weekly") {
    const days = r.weekdays && r.weekdays.length > 0 ? r.weekdays : [start.getDay()];
    const set = new Set(days);
    // Walk day-by-day up to interval weeks out; pick the first matching weekday
    // strictly after `from`. Bounded to interval*7 + 7 to stay finite.
    const maxSteps = r.interval * 7 + 7;
    for (let i = 1; i <= maxSteps; i++) {
      const cand = addDays(start, i);
      if (set.has(cand.getDay())) {
        // For interval > 1 (every N weeks) we only honor matches in the next
        // eligible week block. Simplest robust behavior: weekly interval applies
        // a minimum gap of (interval-1)*7 days before the next match counts.
        if (r.interval === 1 || i >= (r.interval - 1) * 7 + 1) {
          return toYmd(cand);
        }
      }
    }
    // Fallback: interval weeks out on the anchor weekday.
    return toYmd(addDays(start, r.interval * 7));
  }

  // daily | custom — advance by `interval` days.
  return toYmd(addDays(start, r.interval));
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Human-readable summary of a rule for badges / detail copy.
 * e.g. "Every day", "Every 3 days", "Weekly on Mon, Wed", "Every 2 weeks on Fri".
 */
export function describeRule(rule: RecurrenceRule): string {
  const r = normalizeRule(rule);
  if (r.frequency === "daily") return "Every day";
  if (r.frequency === "custom") {
    return r.interval === 1 ? "Every day" : `Every ${r.interval} days`;
  }
  // weekly
  const days = r.weekdays && r.weekdays.length > 0 ? r.weekdays : null;
  const dayLabel = days ? days.map((d) => WEEKDAY_LABELS[d]).join(", ") : null;
  if (r.interval === 1) {
    return dayLabel ? `Weekly on ${dayLabel}` : "Weekly";
  }
  return dayLabel ? `Every ${r.interval} weeks on ${dayLabel}` : `Every ${r.interval} weeks`;
}

/** Short badge label, e.g. "Daily", "Weekly", "Every 3d". */
export function shortRuleLabel(rule: RecurrenceRule): string {
  const r = normalizeRule(rule);
  if (r.frequency === "daily") return "Daily";
  if (r.frequency === "weekly") return r.interval === 1 ? "Weekly" : `${r.interval}w`;
  return r.interval === 1 ? "Daily" : `Every ${r.interval}d`;
}

/** Type guard: is this an actual recurrence rule object? */
export function isRecurrenceRule(value: unknown): value is RecurrenceRule {
  return RecurrenceRuleSchema.safeParse(value).success;
}
