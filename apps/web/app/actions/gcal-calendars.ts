"use server";

/**
 * Server Actions for Google Calendar metadata (calendar list + user timezone).
 *
 * Phase 4 Plan 04-03.
 *
 * Two actions in one file because they share the same auth gate
 * (`requireOnboarded`) and are both small enough not to warrant separate
 * modules; mutations on individual calendars (SET-04 default, D-10 visible
 * set) are out of scope for Plan 04-03 — they ship with Plan 04-04 / Phase 6.
 *
 * Auth (per Plan 04-01 `<auth_helper_convention>`):
 *   - `requireOnboarded()` — `/calendar` and `setTimezone` are both
 *     onboarded-only surfaces. The first-visit timezone detection runs on
 *     /calendar mount; by then the user is past onboarding.
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
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";

type ActionResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: string;
      kind?: "revoked" | "not_connected" | "unknown";
    };

/**
 * List the user's Google calendars (id, summary, color, primary flag, role).
 * Used by /calendar (color mapping + filter chips) and Settings (default-cal
 * picker + visibility checkbox list).
 */
export async function listCalendarsForUser(): Promise<
  ActionResult<GcalCalendarMeta[]>
> {
  const user = await requireOnboarded();
  try {
    const cal = await getValidGcalToken(user.id);
    const data = await listCalendars(cal);
    return { success: true, data };
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
}

/**
 * D-08 — first-visit timezone detection.
 *
 * Called from CalendarClient.tsx on mount when `users.timezone IS NULL`. The
 * regex is intentionally strict: an IANA timezone is `Region/City` (with an
 * optional `/SubRegion` for places like `America/Indiana/Indianapolis`),
 * each segment begins with an uppercase letter. Rejecting malformed input
 * (e.g. a literal `"UTC"` or a Windows-style `"Eastern Standard Time"`)
 * prevents bad strings reaching gcal where they'd cause cryptic 400s.
 *
 * Drift detection (M-01 fix, Pitfall 5) is handled client-side: when the
 * browser's detected zone differs from the persisted one, CalendarClient
 * shows a dismissible toast that — on user accept — calls this same action
 * with the new value.
 */
const TimezoneSchema = z.object({
  timezone: z
    .string()
    .regex(
      /^[A-Z][A-Za-z_]+\/[A-Z][A-Za-z_]+(\/[A-Z][A-Za-z_]+)?$/,
      "Invalid IANA timezone",
    ),
});

export async function setTimezone(
  input: unknown,
): Promise<ActionResult<{ timezone: string }>> {
  const user = await requireOnboarded();
  const parsed = TimezoneSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues[0]?.message ?? "Invalid timezone",
      kind: "unknown",
    };
  }
  await db
    .update(users)
    .set({ timezone: parsed.data.timezone })
    .where(eq(users.id, user.id));
  return { success: true, data: { timezone: parsed.data.timezone } };
}
