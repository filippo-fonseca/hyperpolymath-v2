/**
 * Thin typed wrappers around the gcal events API.
 *
 * Phase 4 Plan 04-01 — these exist so Plans 04-03 / 04-04 can do
 *
 *     import { listEvents, insertEvent, ... } from "@/lib/gcal/events";
 *
 * instead of reaching into `googleapis` directly from page/component code.
 * That indirection:
 *   1. Centralizes the few places where `singleEvents: true` and `timeZone`
 *      MUST be passed (Pitfalls 10, 4) — callers can't forget them when
 *      the wrapper enforces them per its docstring.
 *   2. Gives us one place to add retry/log/metric hooks later without
 *      touching every call site.
 *   3. Keeps Server Actions importing from `@/lib/gcal/*` so a future swap
 *      from full `googleapis` -> `@googleapis/calendar` (Pitfall 12) is a
 *      one-file change.
 *
 * No business logic here. No try/catch — Server Actions catch
 * GcalTokenRevokedError / GcalNotConnectedError / GaxiosError upstream.
 */

import type { calendar_v3 } from "googleapis";
import { getValidGcalToken } from "./token";

export async function listEvents(
  cal: calendar_v3.Calendar,
  params: calendar_v3.Params$Resource$Events$List,
) {
  // Callers MUST pass `singleEvents: true` (Pitfall 10) + `timeZone:
  // users.timezone` for DST correctness — see RESEARCH §Pitfall 10.
  return cal.events.list(params);
}

export async function insertEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  requestBody: calendar_v3.Schema$Event,
) {
  return cal.events.insert({ calendarId, requestBody });
}

export async function patchEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
  requestBody: Partial<calendar_v3.Schema$Event>,
) {
  return cal.events.patch({ calendarId, eventId, requestBody });
}

export async function deleteEvent(
  cal: calendar_v3.Calendar,
  calendarId: string,
  eventId: string,
) {
  return cal.events.delete({ calendarId, eventId });
}

// ---------------------------------------------------------------------------
// Higher-level helper for the JARVIS executor (Phase 5 Plan 05-02).
//
// The thin wrappers above require a caller-constructed `calendar_v3.Calendar`,
// which is fine for /api/gcal/* routes that already hold one. The JARVIS
// executor lives one layer up and would otherwise need to duplicate the
// "build OAuth2 client → setCredentials → calendar() → insert" dance for
// every action. This helper owns that lifecycle so the executor can stay
// focused on validation + result mapping.
//
// SECURITY: `userId` is the caller-controlled value — at the route handler
// boundary it is always re-derived from `getClaims()` (JARVIS-12). This
// helper never reads userId from googleapis input.
// ---------------------------------------------------------------------------

export interface JarvisEventInput {
  calendarId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
}

export interface GcalEventDTO {
  id: string;
  calendarId: string;
  title: string;
  description?: string | null;
  /** ISO 8601 (timeZone aware). */
  start: string;
  end: string;
  htmlLink?: string | null;
}

export async function createEventForJarvis(
  userId: string,
  input: JarvisEventInput,
): Promise<GcalEventDTO> {
  // `getValidGcalToken` returns an already-authenticated calendar_v3.Calendar.
  // Throws GcalNotConnectedError / GcalTokenRevokedError on auth failure —
  // the JARVIS executor catches and maps to ExecutorResult.kind="revoked".
  const cal = await getValidGcalToken(userId);

  const { data } = await insertEvent(cal, input.calendarId, {
    summary: input.title,
    description: input.description ?? undefined,
    start: { dateTime: input.start.toISOString() },
    end: { dateTime: input.end.toISOString() },
  });

  if (!data.id) throw new Error("gcal returned no event id");
  return {
    id: data.id,
    calendarId: input.calendarId,
    title: data.summary ?? input.title,
    description: data.description ?? null,
    start: data.start?.dateTime ?? input.start.toISOString(),
    end: data.end?.dateTime ?? input.end.toISOString(),
    htmlLink: data.htmlLink ?? null,
  };
}
