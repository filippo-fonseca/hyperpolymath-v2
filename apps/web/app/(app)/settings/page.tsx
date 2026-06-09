import Link from "next/link";
import { Brain, Laptop } from "lucide-react";
import { eq } from "drizzle-orm";

import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { Card } from "@/components/ui/card";
import { SettingsForm } from "@/components/settings-form";
import { SignOutButton } from "@/components/sign-out-button";
import { ThemeToggle } from "@/components/shell/ThemeToggle";
import { getGcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import { GcalConnectionRow } from "@/components/settings/GcalConnectionRow";
import { DefaultCalendarPicker } from "@/components/settings/DefaultCalendarPicker";
import { VisibleCalendarsCheckboxList } from "@/components/settings/VisibleCalendarsCheckboxList";
import { TimezoneOverrideRow } from "@/components/settings/TimezoneOverrideRow";
import { VoiceSettingsSection } from "@/components/settings/voice/VoiceSettingsSection";
import { DistanceUnitToggle } from "@/components/training/settings/DistanceUnitToggle";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";

// /settings reads connection status that can change mid-session (after the
// OAuth callback returns OR after a Disconnect Server Action runs).
// `force-dynamic` opts out of Next's full-route cache so each visit re-runs
// `getGcalConnectionStatus` against the live DB.
export const dynamic = "force-dynamic";

/**
 * Phase 06.1 Plan 04 (UI-SPEC §5k, §7f) — document-tier Settings.
 *
 * Visual register:
 *  - bg --canvas
 *  - Tiles are shadcn Cards (Task 1 ships --surface bg + 1px --edge border,
 *    no shadow). Each tile adds hover:border-[var(--edge-hud)] over 150ms
 *    --ease-out-quart — felt-quality grep target for §5k "hover deepens edge"
 *  - H1 serif 36px 600 / H2 serif 24px 600
 *  - Body serif --ink-muted
 *  - Mono only on chrome labels (none on this page — all section heads are serif)
 *  - Amber focus rings via --ring-doc applied globally
 */
export default async function SettingsPage() {
  const user = await requireOnboarded();
  const [gcalStatus, oauthAvatar, distanceUnitRow] = await Promise.all([
    getGcalConnectionStatus(user.id),
    getAuthAvatar(),
    db
      .select({ unit: users.distanceUnit })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
  ]);
  const currentDistanceUnit: "km" | "mi" =
    distanceUnitRow[0]?.unit === "mi" ? "mi" : "km";

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

  // Shared tile chrome: surface + edge border (Card default) + hover --edge-hud
  // deepen per UI-SPEC §5k. Repeated as a className constant keeps each Card
  // call site readable while making the felt-quality contract grep-verifiable.
  const tileHover =
    "p-6 space-y-4 hover:border-[var(--edge-hud)] transition-colors duration-150 ease-out";

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <h1 className="font-serif text-4xl font-semibold text-[var(--ink)]">
            Settings
          </h1>
          <Link
            href="/today"
            className="font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
          >
            Back to today
          </Link>
        </header>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Profile
          </h2>
          <p className="font-serif text-base text-[var(--ink-muted)]">
            {user.email}
          </p>
          <ProfileSection
            userId={user.id}
            email={user.email}
            initialDisplayName={user.displayName}
            initialBio={user.bio}
            initialAvatarUrl={user.avatarUrl}
            initialGithubUsername={user.githubUsername}
            oauthAvatarUrl={oauthAvatar.avatarUrl}
          />
        </Card>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Graduation year
          </h2>
          <SettingsForm
            currentYear={user.graduationYear ?? new Date().getFullYear() + 4}
          />
        </Card>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Appearance
          </h2>
          <div className="space-y-1">
            <p className="font-serif text-base text-[var(--ink)]">Theme</p>
            <p className="font-serif text-base text-[var(--ink-muted)]">
              Light, dark, or follow your system.
            </p>
          </div>
          <ThemeToggle variant="settings" />
        </Card>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Units
          </h2>
          <div className="space-y-1">
            <p className="font-serif text-base text-[var(--ink)]">
              Distance unit
            </p>
            <p className="font-serif text-base text-[var(--ink-muted)]">
              Used across the training planner, completion dialog, and stats.
              Stored data stays in kilometers; only the display converts.
            </p>
          </div>
          <DistanceUnitToggle value={currentDistanceUnit} />
        </Card>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Integrations
          </h2>
          <GcalConnectionRow status={gcalStatus} />
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

        {/* Phase 7 Plan 07-02 — Voice settings (VOICE-01, VOICE-11) */}
        <VoiceSettingsSection />

        {/* Phase 5.1 (D-M6 / JARVIS-18) — Memory settings link */}
        <Card className={tileHover}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)]">
              <Brain className="h-4 w-4" />
            </span>
            <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
              JARVIS Memory
            </h2>
          </div>
          <p className="font-serif text-base text-[var(--ink-muted)]">
            Review, edit, or remove facts JARVIS has remembered about you.
          </p>
          <Link
            href="/settings/memory"
            className="inline-flex items-center font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
          >
            Manage memory →
          </Link>
        </Card>

        {/* Desktop devices — bearer tokens for the Tauri desktop app. */}
        <Card className={tileHover}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)]">
              <Laptop className="h-4 w-4" />
            </span>
            <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
              Desktop devices
            </h2>
          </div>
          <p className="font-serif text-base text-[var(--ink-muted)]">
            Mint a bearer token for the desktop app, then paste it once into
            the device to pair it. Revoke any device at any time.
          </p>
          <Link
            href="/settings/desktop"
            className="inline-flex items-center font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
          >
            Manage devices →
          </Link>
        </Card>

        <Card className={tileHover}>
          <h2 className="font-serif text-2xl font-semibold text-[var(--ink)]">
            Sign out
          </h2>
          <SignOutButton />
        </Card>
      </div>
    </main>
  );
}
