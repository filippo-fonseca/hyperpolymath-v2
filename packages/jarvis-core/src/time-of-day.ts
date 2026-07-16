// Time-of-day bucketing + greeting helpers.
//
// Pure functions ONLY — no Date reads, no timezone I/O. The caller (run-turn.ts
// temporal-context block) reads the current local hour in the user's timezone
// via Intl and passes the numeric hour in here. Keeping this module pure makes
// the bucketing/greeting logic trivially unit-testable and safe to import from
// the cache-sensitive prompt path (it introduces no `new Date()` of its own).
//
// Bug fix (bgsd/time-aware-greeting): JARVIS greeted "Good morning, sir." at
// 1:35 PM. The model was never told the time-of-day bucket nor instructed that
// its greeting must match the local clock. These helpers derive the correct
// bucket + greeting deterministically so the prompt can inject them and a light
// guard can correct a contradicting leading greeting.

/**
 * Coarse time-of-day bucket. Aligned with the LifeOsHero greeting helper
 * (apps/web/components/lifeos/LifeOsHero.tsx) for morning/afternoon/evening,
 * with "night" covering the late 21:00–04:59 window that LifeOsHero renders
 * playfully ("Burning late" / "Still up").
 */
export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

/**
 * Map a 24-hour clock hour (0–23) to its time-of-day bucket.
 *
 * Boundaries (inclusive start, exclusive end):
 *   morning   05:00–11:59
 *   afternoon 12:00–16:59
 *   evening   17:00–20:59
 *   night     21:00–04:59  (wraps midnight)
 *
 * Out-of-range / fractional hours are normalized into 0–23 so a caller that
 * passes e.g. 24 (midnight quirk of some Intl outputs) or a negative offset
 * still gets a sensible bucket.
 */
export function timeOfDayForHour(hour: number): TimeOfDay {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "afternoon";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

/**
 * The spoken/written greeting phrase for a bucket.
 *
 * "night" maps to "Good evening" on purpose: "Good night" is a farewell, not an
 * opener, so a butler greeting the user at 11 PM or 2 AM still says "Good
 * evening". morning/afternoon/evening map to their literal phrases.
 */
export function greetingForTimeOfDay(timeOfDay: TimeOfDay): string {
  switch (timeOfDay) {
    case "morning":
      return "Good morning";
    case "afternoon":
      return "Good afternoon";
    case "evening":
      return "Good evening";
    case "night":
      return "Good evening";
  }
}

/** Convenience: greeting straight from a 24-hour clock hour. */
export function greetingForHour(hour: number): string {
  return greetingForTimeOfDay(timeOfDayForHour(hour));
}

// Leading time-of-day greeting matcher. Case-insensitive; anchors at the start
// (allowing leading whitespace) and requires a word boundary after the bucket
// word so "afternoons" or "morningstar" never match.
const LEADING_GREETING_RE = /^(\s*)good\s+(?:morning|afternoon|evening|night)\b/i;

/**
 * Deterministic safeguard: if `text` OPENS with a time-of-day greeting that
 * contradicts `timeOfDay`, rewrite just that leading greeting to the correct
 * one and leave the rest of the text (punctuation, name, sentence) untouched.
 * If the text does not open with such a greeting, it is returned unchanged.
 *
 * This is intentionally conservative — it only touches a LEADING greeting (the
 * opener), never a greeting mid-sentence, so it cannot mangle prose. It is a
 * belt-and-braces guard layered on top of the primary fix (injecting the
 * correct time-of-day + greeting instruction into the prompt).
 */
export function correctLeadingGreeting(text: string, timeOfDay: TimeOfDay): string {
  const match = text.match(LEADING_GREETING_RE);
  if (!match) return text;
  const leadingWhitespace = match[1] ?? "";
  const rest = text.slice(match[0].length);
  return `${leadingWhitespace}${greetingForTimeOfDay(timeOfDay)}${rest}`;
}
