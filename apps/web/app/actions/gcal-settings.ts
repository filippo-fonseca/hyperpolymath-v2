"use server";

/**
 * Server Actions for Google Calendar Settings rows.
 *
 * Phase 4 Plan 04-04 (SET-04 + D-10).
 *
 * Two actions:
 *   - `setDefaultCalendar({ calendarId })` — writes users.gcal_default_calendar_id.
 *     Drives which calendar Kiwi will post into (Phase 5) and which calendar
 *     EventDetailPanel's create-mode dropdown defaults to.
 *   - `setVisibleCalendars({ calendarIds })` — writes users.gcal_visible_calendar_ids
 *     (text[], nullable). Convention: NULL = "show all calendars". Passing
 *     null from the UI when every box is checked keeps the schema canonical
 *     (no explicit list when the user means "default").
 *
 * Auth (per Plan 04-01 `<auth_helper_convention>`):
 *   - `requireOnboarded()` — both surfaces live under /settings, which is
 *     onboarded-only.
 *
 * No revalidatePath calls — the Settings page is force-dynamic (Plan 04-02),
 * so the Server Component re-runs on `router.refresh()` from the caller.
 * The /calendar grid reads gcal_visible_calendar_ids via the Server
 * Component's initial fetch + TanStack Query's URL-driven param, so a
 * refresh of /calendar picks up the new persistent set.
 */

import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { requireOnboarded } from "@/lib/auth/get-user";

type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string };

const SetDefaultCalendarSchema = z.object({
  calendarId: z.string().min(1),
});

export async function setDefaultCalendar(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireOnboarded();
  const parsed = SetDefaultCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid calendar ID" };
  }
  await db
    .update(users)
    .set({ gcalDefaultCalendarId: parsed.data.calendarId })
    .where(eq(users.id, user.id));
  return { success: true };
}

// D-10: nullable text[] — null means "show all". The UI sends null when the
// user has every calendar checked, NOT an array of all calendar IDs, to keep
// "show everything (including future calendars I add)" semantically distinct
// from "show this fixed list".
const SetVisibleCalendarsSchema = z.object({
  calendarIds: z.array(z.string()).nullable(),
});

export async function setVisibleCalendars(
  input: unknown,
): Promise<ActionResult> {
  const user = await requireOnboarded();
  const parsed = SetVisibleCalendarsSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Invalid calendar list" };
  }
  await db
    .update(users)
    .set({ gcalVisibleCalendarIds: parsed.data.calendarIds })
    .where(eq(users.id, user.id));
  return { success: true };
}
