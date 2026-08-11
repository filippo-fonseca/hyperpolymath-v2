"use server";

/**
 * Server Actions for Google Calendar events.
 *
 * Phase 4 Plan 04-03 shipped `listEventsForUser` (read-only).
 * Phase 4 Plan 04-04 adds `createEvent` / `updateEvent` / `deleteEvent`
 * (CAL-04, CAL-05).
 *
 * Why a Server Action AND a Server-Component fetch in /calendar/page.tsx:
 *   - The Server Component does the *initial* fetch for SSR hydration so the
 *     grid renders with real events on first paint (no flash of empty grid).
 *   - The Server Action backs the client-side `useQuery` refetch path
 *     (refetchOnWindowFocus: true, navigation, filter changes). Same logic;
 *     two callers; one source of truth.
 *
 * Critical correctness:
 *   - `singleEvents: true` (Pitfall 10) — expand recurring rules into
 *     instance events. Without this, recurring series come back as a single
 *     row that the grid renders only at the original start date.
 *   - `timeZone: userTimezone` (Pitfall 10) — gcal returns event times in
 *     the requested zone's offset. Combined with TZDate-wrapping on the
 *     client, this makes wall-clock rendering DST-correct.
 *   - `orderBy: "startTime"` requires `singleEvents: true` (gcal API
 *     constraint); they go together.
 *   - Page through `pageToken` until exhausted — a busy week + 5 calendars
 *     can exceed the 250-item page size.
 *
 * Mutations (CAL-04, CAL-05) — Plan 04-04:
 *   - Recurring events (Pitfall 4): the eventId passed in for updates and
 *     deletes is the *instance* id (returned by `listEventsForUser` with
 *     `singleEvents: true`). gcal interprets `events.patch(instanceId)` as
 *     a per-instance edit — no separate "this/this+future/all" picker for
 *     MVP. The UI surfaces a badge so the user understands the scope.
 *   - Cross-calendar move (Pitfall 9): when `newCalendarId !== currentCalendarId`,
 *     `events.move` runs FIRST (preserves the event ID), then `events.patch`
 *     applies any field-level changes on the destination calendar. The
 *     ordering matters — patching the source-calendar event after a move
 *     would 404.
 *   - NEVER call Next.js' path-revalidation helper — events live in gcal,
 *     not Postgres, so TanStack Query is the single cache invalidation
 *     surface. The Phase 3 lesson holds.
 *   - `eventToDTO` is the response mapper (single source of truth shared
 *     with listEventsForUser).
 *
 * Auth (per Plan 04-01 `<auth_helper_convention>`):
 *   - `requireOnboarded()` — `/calendar` is an onboarded-only surface. The
 *     onboarding flow MUST be complete before the user can look at events
 *     (matches /today + /tasks + /captures). Every action in this file
 *     uses it.
 *
 * Error mapping (every mutation + the listing share this taxonomy):
 *   - GcalTokenRevokedError → `{ kind: "revoked" }` — UI shows DisconnectBanner.
 *   - GcalNotConnectedError → `{ kind: "not_connected" }` — UI shows EmptyState.
 *   - Anything else (network blip, gcal 5xx) — rethrow so Next.js' error
 *     boundary catches it. Don't swallow infra failures into ActionResult.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import type { calendar_v3 } from "googleapis";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireOnboarded } from "@/lib/auth/get-user";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { eventToDTO, type GcalEventDTO } from "@/lib/gcal/event-dto";

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      kind: "revoked" | "not_connected" | "unknown";
    };

const ListSchema = z.object({
  calendarIds: z.array(z.string()).min(1),
  timeMin: z.string(), // ISO 8601
  timeMax: z.string(),
});

export async function listEventsForUser(
  input: unknown,
): Promise<ActionResult<GcalEventDTO[]>> {
  const user = await requireOnboarded();
  const parsed = ListSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      kind: "unknown",
    };
  }

  // AuthenticatedUser doesn't include timezone — read separately. Defaults to
  // UTC if the user hasn't visited /calendar yet (D-08 first-visit detection
  // will populate it).
  const tzRow = await db
    .select({ tz: users.timezone })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);
  const userTimezone = tzRow[0]?.tz ?? "UTC";

  let calendar;
  try {
    calendar = await getValidGcalToken(user.id);
  } catch (e) {
    if (e instanceof GcalTokenRevokedError) {
      return {
        success: false,
        error: "Reconnect Google Calendar",
        kind: "revoked",
      };
    }
    if (e instanceof GcalNotConnectedError) {
      return { success: false, error: "Not connected", kind: "not_connected" };
    }
    throw e;
  }

  const all: GcalEventDTO[] = [];
  for (const calendarId of parsed.data.calendarIds) {
    let pageToken: string | undefined;
    do {
      const { data } = await calendar.events.list({
        calendarId,
        timeMin: parsed.data.timeMin,
        timeMax: parsed.data.timeMax,
        singleEvents: true, // Pitfall 10 — expand recurring
        orderBy: "startTime",
        maxResults: 250,
        pageToken,
        timeZone: userTimezone, // Pitfall 10 — DST correctness
      });
      for (const e of data.items ?? []) {
        const dto = eventToDTO(e, calendarId);
        if (dto) all.push(dto);
      }
      pageToken = data.nextPageToken ?? undefined;
    } while (pageToken);
  }
  return { success: true, data: all };
}

// ---------------------------------------------------------------------------
// Mutations — Plan 04-04 (CAL-04, CAL-05).
// ---------------------------------------------------------------------------

/**
 * Shared gcal-client acquisition with the canonical revoked/not-connected
 * mapping. Pulled out of every action's preamble so the four mutation paths
 * (and the listing path, conceptually) share one source of truth.
 */
// The failure variant of ActionResult — shape is independent of the data type T,
// so we can hoist it for sharing across the mutation actions without a generic
// at the acquireCalendar boundary.
type ActionFailure = Extract<ActionResult<unknown>, { success: false }>;

type AcquireResult =
  | { ok: true; cal: calendar_v3.Calendar }
  | { ok: false; result: ActionFailure };

async function acquireCalendar(userId: string): Promise<AcquireResult> {
  try {
    const cal = await getValidGcalToken(userId);
    return { ok: true, cal };
  } catch (e) {
    if (e instanceof GcalTokenRevokedError) {
      return {
        ok: false,
        result: {
          success: false,
          error: "Reconnect Google Calendar",
          kind: "revoked",
        },
      };
    }
    if (e instanceof GcalNotConnectedError) {
      return {
        ok: false,
        result: {
          success: false,
          error: "Not connected",
          kind: "not_connected",
        },
      };
    }
    throw e;
  }
}

// Guest emails ride on the event resource as `attendees: [{ email }]`.
// gcal caps invites well above this; 100 keeps the payload sane.
const AttendeesSchema = z.array(z.email()).max(100);

// `sendUpdates` maps 1:1 to the events.insert / events.patch query param —
// "all" emails invitations/updates to guests, "none" saves silently.
const SendUpdatesSchema = z.enum(["all", "none"]);

/**
 * Auto-generated Meet conference request. `requestId` must be fresh per
 * attempt (gcal dedupes on it); `conferenceDataVersion: 1` must accompany
 * the API call or the createRequest is silently ignored.
 */
function meetCreateRequest(): calendar_v3.Schema$ConferenceData {
  return {
    createRequest: {
      requestId: crypto.randomUUID(),
      conferenceSolutionKey: { type: "hangoutsMeet" },
    },
  };
}

const CreateEventSchema = z.object({
  calendarId: z.string().min(1),
  title: z.string().min(1).max(1024),
  description: z.string().max(8192).optional().nullable(),
  // ISO with offset (timed) OR YYYY-MM-DD for all-day. The action slices off
  // the date portion when allDay is true.
  start: z.string().min(1),
  end: z.string().min(1),
  allDay: z.boolean(),
  userTimezone: z.string().min(1), // e.g., "America/New_York"
  attendees: AttendeesSchema.optional(),
  addMeet: z.boolean().optional(),
  sendUpdates: SendUpdatesSchema.optional(),
});

export async function createEvent(
  input: unknown,
): Promise<ActionResult<GcalEventDTO>> {
  const user = await requireOnboarded();
  const parsed = CreateEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      kind: "unknown",
    };
  }

  const acquired = await acquireCalendar(user.id);
  if (!acquired.ok) return acquired.result;

  const {
    calendarId,
    title,
    description,
    start,
    end,
    allDay,
    userTimezone,
    attendees,
    addMeet,
    sendUpdates,
  } = parsed.data;

  const requestBody: calendar_v3.Schema$Event = {
    summary: title,
    description: description ?? undefined,
    start: allDay
      ? { date: start.slice(0, 10) }
      : { dateTime: start, timeZone: userTimezone },
    end: allDay
      ? { date: end.slice(0, 10) }
      : { dateTime: end, timeZone: userTimezone },
  };
  if (attendees && attendees.length > 0) {
    requestBody.attendees = attendees.map((email) => ({ email }));
  }
  if (addMeet) {
    requestBody.conferenceData = meetCreateRequest();
  }

  const { data } = await acquired.cal.events.insert({
    calendarId,
    requestBody,
    // Required for the Meet createRequest to take effect; harmless otherwise
    // (and makes the response include conferenceData for the DTO).
    conferenceDataVersion: 1,
    sendUpdates,
  });
  const dto = eventToDTO(data, calendarId);
  if (!dto) {
    return {
      success: false,
      error: "gcal returned invalid event shape",
      kind: "unknown",
    };
  }
  return { success: true, data: dto };
}

// Update — handles BOTH events.patch (same calendar) and events.move +
// events.patch (calendar changed). Move-then-patch ordering matters: a patch
// against the source calendar after a move would 404.
const UpdateEventSchema = z.object({
  eventId: z.string().min(1),
  currentCalendarId: z.string().min(1),
  newCalendarId: z.string().min(1), // may equal currentCalendarId
  title: z.string().min(1).max(1024).optional(),
  description: z.string().max(8192).nullable().optional(),
  start: z.string().min(1).optional(),
  end: z.string().min(1).optional(),
  allDay: z.boolean().optional(),
  userTimezone: z.string().min(1),
  /**
   * Full desired guest list (emails). `undefined` leaves attendees untouched.
   * An empty array removes all guests. Existing attendees keep their RSVP
   * state — the action merges against the current event before patching.
   */
  attendees: AttendeesSchema.optional(),
  /** "add" requests a fresh Meet link; "remove" clears conferencing. */
  meet: z.enum(["add", "remove"]).optional(),
  sendUpdates: SendUpdatesSchema.optional(),
});

export async function updateEvent(
  input: unknown,
): Promise<ActionResult<GcalEventDTO>> {
  const user = await requireOnboarded();
  const parsed = UpdateEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      kind: "unknown",
    };
  }

  const acquired = await acquireCalendar(user.id);
  if (!acquired.ok) return acquired.result;

  const {
    eventId,
    currentCalendarId,
    newCalendarId,
    title,
    description,
    start,
    end,
    allDay,
    userTimezone,
    attendees,
    meet,
    sendUpdates,
  } = parsed.data;

  // Cross-calendar move FIRST (Pitfall 9). events.move preserves the event
  // ID per gcal docs; the subsequent patch targets the destination calendar.
  let effectiveCalendarId = currentCalendarId;
  if (newCalendarId !== currentCalendarId) {
    await acquired.cal.events.move({
      calendarId: currentCalendarId,
      eventId,
      destination: newCalendarId,
    });
    effectiveCalendarId = newCalendarId;
  }

  // Field-level patch. Build requestBody with ONLY defined fields so we
  // don't accidentally clobber server-side values with `undefined`.
  const requestBody: Partial<calendar_v3.Schema$Event> = {};
  if (title !== undefined) requestBody.summary = title;
  if (description !== undefined) requestBody.description = description ?? "";
  // start+end+allDay are a triplet — only patch dates when all three are
  // present so the gcal payload is internally consistent (date vs dateTime).
  if (start !== undefined && end !== undefined && allDay !== undefined) {
    requestBody.start = allDay
      ? { date: start.slice(0, 10) }
      : { dateTime: start, timeZone: userTimezone };
    requestBody.end = allDay
      ? { date: end.slice(0, 10) }
      : { dateTime: end, timeZone: userTimezone };
  }

  // Attendee edits: the client sends the full desired email list. To avoid
  // wiping RSVP state we merge against the CURRENT attendee rows — a kept
  // guest keeps their whole attendee object (responseStatus, displayName,
  // optional, …); only genuinely-new emails go up as bare `{ email }`.
  if (attendees !== undefined) {
    const { data: current } = await acquired.cal.events.get({
      calendarId: effectiveCalendarId,
      eventId,
    });
    const existingByEmail = new Map(
      (current.attendees ?? [])
        .filter((a) => a.email)
        .map((a) => [(a.email as string).toLowerCase(), a]),
    );
    requestBody.attendees = attendees.map(
      (email) => existingByEmail.get(email.toLowerCase()) ?? { email },
    );
  }

  if (meet === "add") {
    requestBody.conferenceData = meetCreateRequest();
  } else if (meet === "remove") {
    // Explicit null clears conferencing on patch (with conferenceDataVersion
    // 1). The generated googleapis type doesn't admit null here even though
    // the API contract does — hence the narrow cast.
    (
      requestBody as { conferenceData?: calendar_v3.Schema$ConferenceData | null }
    ).conferenceData = null;
  }

  const { data } = await acquired.cal.events.patch({
    calendarId: effectiveCalendarId,
    eventId,
    requestBody,
    conferenceDataVersion: 1,
    sendUpdates,
  });
  const dto = eventToDTO(data, effectiveCalendarId);
  if (!dto) {
    return {
      success: false,
      error: "gcal returned invalid event shape",
      kind: "unknown",
    };
  }
  return { success: true, data: dto };
}

const DeleteEventSchema = z.object({
  calendarId: z.string().min(1),
  eventId: z.string().min(1),
});

export async function deleteEvent(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireOnboarded();
  const parsed = DeleteEventSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid input",
      kind: "unknown",
    };
  }

  const acquired = await acquireCalendar(user.id);
  if (!acquired.ok) return acquired.result;

  try {
    await acquired.cal.events.delete({
      calendarId: parsed.data.calendarId,
      eventId: parsed.data.eventId,
    });
  } catch (e) {
    // Delete is idempotent: gcal returns 410 Gone when the event was already
    // deleted (or 404 when it never existed on this calendar). Either way the
    // post-condition the caller wants ("this event is not on the calendar")
    // already holds, so report success rather than rethrowing into the error
    // boundary. Any other status (auth, 5xx, network) is a real failure and
    // rethrows so the optimistic delete rolls back.
    const status = gcalErrorStatus(e);
    if (status === 410 || status === 404) {
      return { success: true, data: { id: parsed.data.eventId } };
    }
    throw e;
  }
  return { success: true, data: { id: parsed.data.eventId } };
}

/**
 * Extract the HTTP status from a googleapis/gaxios error without importing the
 * gaxios types. The thrown error exposes the status as `code` (number or
 * numeric string) and/or `response.status` depending on the failure path.
 */
function gcalErrorStatus(e: unknown): number | undefined {
  if (typeof e !== "object" || e === null) return undefined;
  const err = e as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  const fromCode =
    typeof err.code === "number"
      ? err.code
      : typeof err.code === "string" && /^\d+$/.test(err.code)
        ? Number(err.code)
        : undefined;
  return fromCode ?? err.status ?? err.response?.status;
}
