/**
 * `calendar.calendarList.list()` wrapper returning the minimal metadata the
 * UI needs for D-03 (mirror per-calendar gcal colors) + D-09/D-10
 * (default + visibility selection in Settings).
 *
 * Phase 4 Plan 04-01.
 *
 * Why this shape:
 *   - `id`, `summary`         — identify and label the calendar in pickers.
 *   - `backgroundColor`,
 *     `foregroundColor`       — D-03 requires per-event coloring matching
 *                               the source-calendar's gcal color.
 *   - `primary`               — D-09 default-calendar picker auto-selects
 *                               the primary if no user preference set.
 *   - `accessRole`            — readers can't be selected as the Kiwi
 *                               default (we wouldn't be able to insert).
 *
 * We DROP entries with missing `id` defensively; the gcal API guarantees an
 * id on every calendarList entry but the type allows null, and a null id is
 * unusable downstream.
 *
 * Pitfall 9: per-event colorId (vs per-calendar colors) is deferred to backlog
 * for MVP. This wrapper returns calendar-level colors only; downstream
 * resolution lives in components/calendar/* (Plan 04-03).
 */

import type { calendar_v3 } from "googleapis";

export interface GcalCalendarMeta {
  id: string;
  summary: string;
  backgroundColor: string;
  foregroundColor: string;
  primary: boolean;
  accessRole: string;
}

export async function listCalendars(
  cal: calendar_v3.Calendar,
): Promise<GcalCalendarMeta[]> {
  const { data } = await cal.calendarList.list();
  const items = data.items ?? [];
  return items
    .filter((c): c is calendar_v3.Schema$CalendarListEntry & { id: string } =>
      Boolean(c.id),
    )
    .map((c) => ({
      id: c.id,
      summary: c.summary ?? "(untitled)",
      backgroundColor: c.backgroundColor ?? "#4285F4", // Google blue default
      foregroundColor: c.foregroundColor ?? "#FFFFFF",
      primary: Boolean(c.primary),
      accessRole: c.accessRole ?? "reader",
    }));
}
