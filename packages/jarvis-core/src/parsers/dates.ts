// JARVIS-04 / D-10: chrono-node parses natural-language date grammar;
// @date-fns/tz `TZDate` re-interprets the inferred wall-clock components in
// the user's IANA zone (DST-aware).
//
// chrono-node v2 cannot accept IANA strings directly (research §4.1) — the
// only correct DST-aware pattern is "chrono → wall-clock → TZDate".
//
// Two subtleties enforced here:
// 1. We use `start.get(unit)` (implied values) when `knownValues` lacks
//    calendar components — e.g. "sunday 1:30am" knows only weekday + time,
//    but chrono internally resolves which sunday. Reading via `get("year")`
//    surfaces the resolved value.
// 2. `TZDate.toISOString()` returns an offset-formatted string ("...-04:00")
//    by design. To produce a UTC `Z` ISO string we round-trip through
//    `new Date(tzDate.getTime()).toISOString()`.

import { TZDate } from "@date-fns/tz";
import * as chrono from "chrono-node";
import type { ParsedDate } from "../types";

function toUtcIso(tzDate: TZDate): string {
  return new Date(tzDate.getTime()).toISOString();
}

function resolveWallClock(
  c: chrono.ParsedComponents,
  fallback: { year: number; month: number; day: number },
): { year: number; month: number; day: number; hour: number; minute: number; hourKnown: boolean } {
  const year = c.get("year") ?? fallback.year;
  const month = c.get("month") ?? fallback.month;
  const day = c.get("day") ?? fallback.day;
  const hour = c.get("hour") ?? 0;
  const minute = c.get("minute") ?? 0;
  // chrono treats the time-of-day as "certain" when the input explicitly
  // specified it (e.g. "3am"). Implied times (default 12:00) are not certain.
  const hourKnown = c.isCertain("hour");
  return { year, month, day, hour, minute, hourKnown };
}

// chrono-node v2 does not natively recognise common SMS-style abbreviations
// ("tmrw", "tmw", "tmrrw" → tomorrow; "tnt" → tonight). We normalise the
// input before handing it to chrono so users can type the way they text.
const ABBREVIATION_REPLACEMENTS: Array<[RegExp, string]> = [
  [/\btmrrw\b/gi, "tomorrow"],
  [/\btmrw\b/gi, "tomorrow"],
  [/\btmw\b/gi, "tomorrow"],
  [/\btmr\b/gi, "tomorrow"],
  [/\btnt\b/gi, "tonight"],
];

function normaliseAbbreviations(text: string): string {
  let out = text;
  for (const [re, replacement] of ABBREVIATION_REPLACEMENTS) {
    out = out.replace(re, replacement);
  }
  return out;
}

export function parseDates(
  text: string,
  ianaTz: string,
  refDate: Date = new Date(),
): ParsedDate[] {
  // Reference instant interpreted in the user's zone so "tomorrow" is
  // anchored to their local "today".
  const refInTz = new TZDate(refDate, ianaTz);
  const normalised = normaliseAbbreviations(text);
  const results = chrono.parse(normalised, refInTz, { forwardDate: true });

  return results.map((r) => {
    const startFallback = {
      year: refInTz.getFullYear(),
      month: refInTz.getMonth() + 1,
      day: refInTz.getDate(),
    };
    const s = resolveWallClock(r.start, startFallback);
    const startInTz = new TZDate(
      s.year,
      s.month - 1,
      s.day,
      s.hour,
      s.minute,
      0,
      ianaTz,
    );

    let endIso: string | undefined;
    if (r.end) {
      const e = resolveWallClock(r.end, {
        year: s.year,
        month: s.month,
        day: s.day,
      });
      const endInTz = new TZDate(
        e.year,
        e.month - 1,
        e.day,
        e.hour,
        e.minute,
        0,
        ianaTz,
      );
      endIso = toUtcIso(endInTz);
    }

    return {
      text: r.text,
      start: toUtcIso(startInTz),
      end: endIso,
      allDay: !s.hourKnown,
    };
  });
}
