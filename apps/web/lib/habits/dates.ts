/**
 * Local-date helpers shared by every habits surface, server and client alike.
 * All strings are local `YYYY-MM-DD` (NOT UTC): what the user sees is what the
 * server stores. `components/habits/date-utils.ts` re-exports these so client
 * components keep their existing import path; server code (actions, analytics,
 * the Kiwi context node) imports from here directly.
 */

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

/** Parse `YYYY-MM-DD` into a local-midnight Date. Tolerant of trailing time. */
export function parseISODate(iso: string): Date {
  // Anchor at local midnight — `new Date("2026-05-26")` would parse as UTC
  // and shift back across DST in some zones.
  return new Date(`${iso.slice(0, 10)}T00:00:00`);
}

export function addDaysISO(iso: string, n: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** Day of week (0 = Sunday) for a local ISO date. */
export function dayOfWeekISO(iso: string): number {
  return parseISODate(iso).getDay();
}
