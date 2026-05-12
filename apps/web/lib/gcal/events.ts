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
