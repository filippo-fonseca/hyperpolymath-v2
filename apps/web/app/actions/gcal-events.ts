"use server";

/**
 * Server Actions for Google Calendar events.
 *
 * Phase 4 Plan 04-03 — READ-ONLY (`listEventsForUser`). Mutations land in
 * Plan 04-04.
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
 * Auth (per Plan 04-01 `<auth_helper_convention>`):
 *   - `requireOnboarded()` — `/calendar` is an onboarded-only surface. The
 *     onboarding flow MUST be complete before the user can look at events
 *     (matches /today + /tasks + /captures).
 *
 * Error mapping:
 *   - GcalTokenRevokedError → `{ kind: "revoked" }` — UI shows DisconnectBanner.
 *   - GcalNotConnectedError → `{ kind: "not_connected" }` — UI shows EmptyState.
 *   - Anything else (network blip, gcal 5xx) — rethrow so Next.js' error
 *     boundary catches it. Don't swallow infra failures into ActionResult.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
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
