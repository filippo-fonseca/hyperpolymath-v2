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
    const weekdays = Array.from(
      new Set((rule.weekdays ?? []).filter((d) => d >= 0 && d <= 6))
    ).sort((a, b) => a - b);
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

/** Mon–Fri, in storage order (Sun = 0). */
export const WEEKDAYS_WORKWEEK = [1, 2, 3, 4, 5];
/** Sat + Sun. */
export const WEEKDAYS_WEEKEND = [0, 6];

/**
 * The presets the editor offers, in menu order. Every one of them is expressed
 * in the SAME rule shape — no new storage, no migration: "every weekday" is
 * just a weekly rule whose weekdays are Mon–Fri.
 *
 * `custom` is not a preset; it is what you land on when the pills or the
 * interval no longer match any of these.
 */
export type RecurrencePreset =
  | "none"
  | "daily"
  | "weekly"
  | "weekdays"
  | "weekends"
  | "every-n-days"
  | "custom";

function sameDays(a: number[] | undefined, b: number[]): boolean {
  const x = Array.from(new Set(a ?? [])).sort((p, q) => p - q);
  return x.length === b.length && x.every((d, i) => d === b[i]);
}

/**
 * Which preset a stored rule reads as. This is what keeps the editor honest
 * when a rule arrives from elsewhere (JARVIS, an older row): the menu shows
 * the name of what the rule ACTUALLY does rather than defaulting to Custom.
 *
 * `anchorWeekday` is the due date's weekday, so a plain weekly rule on the
 * task's own day reads as "Weekly" rather than as a custom one-pill selection.
 */
export function presetForRule(
  rule: RecurrenceRule | null,
  anchorWeekday?: number
): RecurrencePreset {
  if (!rule) return "none";
  const r = normalizeRule(rule);

  if (r.frequency === "daily") return "daily";
  if (r.frequency === "custom") return r.interval === 1 ? "daily" : "every-n-days";

  // weekly
  if (r.interval !== 1) return "custom";
  const days = r.weekdays ?? [];
  if (sameDays(days, WEEKDAYS_WORKWEEK)) return "weekdays";
  if (sameDays(days, WEEKDAYS_WEEKEND)) return "weekends";
  if (days.length === 1 && (anchorWeekday === undefined || days[0] === anchorWeekday)) {
    return "weekly";
  }
  return "custom";
}

/**
 * The rule a preset produces. `anchorWeekday` seeds "Weekly" with the task's
 * own day, and `previous` carries an interval or weekday selection forward so
 * flipping between presets does not silently discard what was typed.
 */
export function ruleForPreset(
  preset: RecurrencePreset,
  opts: { anchorWeekday?: number; previous?: RecurrenceRule | null } = {}
): RecurrenceRule | null {
  const { anchorWeekday = 1, previous } = opts;
  switch (preset) {
    case "none":
      return null;
    case "daily":
      return normalizeRule({ frequency: "daily", interval: 1 });
    case "weekly":
      return normalizeRule({
        frequency: "weekly",
        interval: 1,
        weekdays: [anchorWeekday],
      });
    case "weekdays":
      return normalizeRule({
        frequency: "weekly",
        interval: 1,
        weekdays: WEEKDAYS_WORKWEEK,
      });
    case "weekends":
      return normalizeRule({
        frequency: "weekly",
        interval: 1,
        weekdays: WEEKDAYS_WEEKEND,
      });
    case "every-n-days":
      return normalizeRule({
        frequency: "custom",
        interval: Math.max(2, previous?.interval ?? 2),
      });
    case "custom": {
      const weekdays =
        previous?.frequency === "weekly" && (previous.weekdays?.length ?? 0) > 0
          ? previous.weekdays
          : [anchorWeekday];
      return normalizeRule({
        frequency: "weekly",
        interval: previous?.frequency === "weekly" ? previous.interval : 1,
        weekdays,
      });
    }
  }
}

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
  // Name the two selections that have names. "Mon, Tue, Wed, Thu, Fri" is
  // technically accurate and nobody reads it as "every weekday".
  if (days && r.interval === 1) {
    if (sameDays(days, WEEKDAYS_WORKWEEK)) return "Every weekday";
    if (sameDays(days, WEEKDAYS_WEEKEND)) return "Every weekend day";
  }
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
