import Link from "next/link";
import { eq } from "drizzle-orm";

import { requireOnboarded } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings-form";
import { SignOutButton } from "@/components/sign-out-button";
import { getGcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import { GcalConnectionRow } from "@/components/settings/GcalConnectionRow";
import { DefaultCalendarPicker } from "@/components/settings/DefaultCalendarPicker";
import { VisibleCalendarsCheckboxList } from "@/components/settings/VisibleCalendarsCheckboxList";
import { TimezoneOverrideRow } from "@/components/settings/TimezoneOverrideRow";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";

// /settings reads connection status that can change mid-session (after the
// OAuth callback returns OR after a Disconnect Server Action runs).
// `force-dynamic` opts out of Next's full-route cache so each visit re-runs
// `getGcalConnectionStatus` against the live DB. Plan 04-04 reuses the same
// dynamic gate for the gcal-prefs fetch (calendars + tz + visible/default).
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await requireOnboarded();
  const gcalStatus = await getGcalConnectionStatus(user.id);

  // Plan 04-04 — fetch the per-user gcal prefs + the calendar list ONLY
  // when connected. Wrap in try/catch so a token revoked between the
  // status read and the calendar list read still renders the page (the
  // status badge will show "Not connected" on the next refresh once the
  // token layer NULLs the columns).
  let calendars: GcalCalendarMeta[] = [];
  let currentDefault: string | null = null;
  let currentVisible: string[] | null = null;
  let currentTimezone: string | null = null;

  if (gcalStatus === "connected") {
    const prefRow = await db
      .select({
        defaultId: users.gcalDefaultCalendarId,
        visible: users.gcalVisibleCalendarIds,
        tz: users.timezone,
      })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);
    currentDefault = prefRow[0]?.defaultId ?? null;
    currentVisible = prefRow[0]?.visible ?? null;
    currentTimezone = prefRow[0]?.tz ?? null;

    try {
      const cal = await getValidGcalToken(user.id);
      calendars = await listCalendars(cal);
    } catch (e) {
      // If the token revoked between the status check and the listCalendars
      // call (e.g., user revoked externally), the status row will reflect
      // "not_connected" on the next visit because getValidGcalToken NULLs
      // the encrypted columns on invalid_grant. For this render, we just
      // skip the multi-calendar rows.
      if (
        e instanceof GcalTokenRevokedError ||
        e instanceof GcalNotConnectedError
      ) {
        calendars = [];
      } else {
        throw e;
      }
    }
  }

  return (
    <main className="min-h-screen px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="text-4xl font-serif">Settings</h1>
          <Link href="/today" className="underline text-sm">
            Back to today
          </Link>
        </header>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Account</h2>
          <p className="text-sm text-neutral-600">{user.email}</p>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Graduation year</h2>
          <SettingsForm
            currentYear={user.graduationYear ?? new Date().getFullYear() + 4}
          />
        </Card>

        <Card className="p-6 space-y-2">
          <h2 className="text-lg font-medium">Integrations</h2>
          <GcalConnectionRow status={gcalStatus} />
          {/* Plan 04-04 — the three multi-cal + tz override rows render
              only when gcal is connected AND the calendar list resolved.
              If the user externally revoked, calendars is [] and the rows
              are hidden until reconnection. */}
          {gcalStatus === "connected" && calendars.length > 0 && (
            <>
              <DefaultCalendarPicker
                calendars={calendars}
                currentDefault={currentDefault}
              />
              <VisibleCalendarsCheckboxList
                calendars={calendars}
                currentVisible={currentVisible}
              />
              <TimezoneOverrideRow currentTimezone={currentTimezone} />
            </>
          )}
        </Card>

        {/* Phase 5.1 (D-M6 / JARVIS-18) — Memory settings link */}
        <Card className="p-6 space-y-2">
          <h2 className="text-lg font-medium">JARVIS Memory</h2>
          <p className="text-sm text-muted-foreground">
            Review, edit, or remove facts JARVIS has remembered about you.
          </p>
          <Link
            href="/settings/memory"
            className="inline-flex items-center text-sm underline underline-offset-4 hover:text-foreground/80"
          >
            Manage memory
          </Link>
        </Card>

        <Card className="p-6 space-y-4">
          <h2 className="text-lg font-medium">Sign out</h2>
          <SignOutButton />
        </Card>
      </div>
    </main>
  );
}
