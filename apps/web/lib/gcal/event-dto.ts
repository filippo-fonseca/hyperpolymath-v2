/**
 * `GcalEventDTO` + `eventToDTO` mapper — the app-shaped row we hand to the
 * client from every gcal events.list / events.insert / events.patch response.
 *
 * Phase 4 Plan 04-03.
 *
 * Why a DTO instead of passing `calendar_v3.Schema$Event` straight to the
 * client:
 *   1. The gcal type is huge (50+ fields most of which we never read) — a
 *      flat DTO keeps the over-the-wire payload small.
 *   2. The DTO normalises the start/end shape. gcal returns ONE of
 *      `{ dateTime, timeZone }` (timed event) or `{ date }` (all-day event)
 *      per side; consumers downstream want a single `start: string` they can
 *      pass to `new Date(...)` or `new TZDate(...)` without branching.
 *   3. `allDay` is a derived boolean (true iff `e.start.date` is present).
 *      Computing it once at the boundary means CalendarGrid / EventDetailPanel
 *      never have to re-check the discriminator.
 *
 * Defensive nulls:
 *   - The mapper returns `null` when `id` or `start` or `end` is missing.
 *     The gcal API guarantees these on real events but the type marks them
 *     optional, so we drop the row rather than synthesise placeholder data.
 *   - All other optional fields fall back to either `null` (description,
 *     colorId, recurringEventId) or `""` (title, htmlLink) so consumers can
 *     assume non-null `string` typing.
 *
 * Recurring events (Pitfall 4):
 *   - `recurringEventId` is exposed verbatim from gcal. If non-null, the row
 *     is an *instance* of a recurring series; edits in Plan 04-04 must call
 *     `events.patch({ eventId: instanceId })`, NOT the parent series id.
 *     EventDetailPanel surfaces this via a small "Recurring — instance only"
 *     badge for user transparency.
 *
 * Used by:
 *   - app/actions/gcal-events.ts (listEventsForUser → returns GcalEventDTO[])
 *   - app/(app)/calendar/page.tsx (Server Component initial fetch)
 *   - components/calendar/CalendarClient.tsx (Map<DTO, GridEvent>)
 */

import type { calendar_v3 } from "googleapis";

/** gcal's closed vocabulary for an attendee's RSVP state. */
export type GcalAttendeeResponseStatus =
  | "needsAction"
  | "declined"
  | "tentative"
  | "accepted";

const RESPONSE_STATUSES: readonly GcalAttendeeResponseStatus[] = [
  "needsAction",
  "declined",
  "tentative",
  "accepted",
];

function toResponseStatus(
  v: string | null | undefined,
): GcalAttendeeResponseStatus | null {
  return RESPONSE_STATUSES.includes(v as GcalAttendeeResponseStatus)
    ? (v as GcalAttendeeResponseStatus)
    : null;
}

/**
 * App-shaped attendee row. `resource` attendees (rooms, equipment) are
 * dropped at the boundary — the invitees UI is about people.
 */
export interface GcalAttendeeDTO {
  email: string;
  displayName: string | null;
  responseStatus: GcalAttendeeResponseStatus | null;
  organizer: boolean;
  self: boolean;
}

export interface GcalEventDTO {
  id: string;
  calendarId: string;
  title: string;
  start: string; // ISO with offset (timed) OR YYYY-MM-DD (all-day)
  end: string;
  allDay: boolean;
  description: string | null;
  colorId: string | null;
  recurringEventId: string | null;
  htmlLink: string;
  /** Guests on the event (people only; resources filtered out). */
  attendees: GcalAttendeeDTO[];
  /**
   * Joinable conferencing link (Google Meet). Falls back to the video
   * entry point inside `conferenceData` when `hangoutLink` is absent.
   */
  hangoutLink: string | null;
}

/** Best joinable link for the event's conference, if any. */
function conferenceLink(e: calendar_v3.Schema$Event): string | null {
  if (e.hangoutLink) return e.hangoutLink;
  const video = e.conferenceData?.entryPoints?.find(
    (p) => p.entryPointType === "video" && p.uri,
  );
  return video?.uri ?? null;
}

export function eventToDTO(
  e: calendar_v3.Schema$Event,
  calendarId: string,
): GcalEventDTO | null {
  if (!e.id || !e.start || !e.end) return null;
  // All-day events use `date` (YYYY-MM-DD); timed events use `dateTime` (ISO+offset).
  const startStr = e.start.dateTime ?? e.start.date;
  const endStr = e.end.dateTime ?? e.end.date;
  if (!startStr || !endStr) return null;
  return {
    id: e.id,
    calendarId,
    title: e.summary ?? "(untitled)",
    start: startStr,
    end: endStr,
    // `.date` present iff all-day (per gcal API contract).
    allDay: Boolean(e.start.date),
    description: e.description ?? null,
    colorId: e.colorId ?? null,
    recurringEventId: e.recurringEventId ?? null,
    htmlLink: e.htmlLink ?? "",
    attendees: (e.attendees ?? [])
      .filter((a) => Boolean(a.email) && !a.resource)
      .map((a) => ({
        email: a.email as string,
        displayName: a.displayName ?? null,
        responseStatus: toResponseStatus(a.responseStatus),
        organizer: Boolean(a.organizer),
        self: Boolean(a.self),
      })),
    hangoutLink: conferenceLink(e),
  };
}
