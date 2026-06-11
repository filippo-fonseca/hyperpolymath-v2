import Link from "next/link";
import { Brain, KeyRound, Laptop, Network } from "lucide-react";
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
import { SettingsSectionNav } from "@/components/settings/SettingsSectionNav";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";

export const dynamic = "force-dynamic";

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

  // Soft neumorphic pillow — paired raised highlight + recessed shadow that
  // sits gently on --canvas. Hover deepens the edge per UI-SPEC §5k.
  const tile =
    "p-6 space-y-4 rounded-xl border-[color-mix(in_oklch,var(--edge)_70%,transparent)] " +
    "shadow-[6px_6px_18px_color-mix(in_oklch,var(--ink)_8%,transparent),-4px_-4px_14px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
    "hover:border-[var(--edge-hud)] hover:shadow-[8px_8px_22px_color-mix(in_oklch,var(--ink)_12%,transparent),-5px_-5px_16px_color-mix(in_oklch,var(--surface)_70%,white),inset_0_1px_0_color-mix(in_oklch,white_60%,transparent)] " +
    "transition-[border-color,box-shadow] duration-200 ease-out";

  const sectionHeader =
    "font-mono text-[10.5px] uppercase tracking-[0.18em] text-[var(--ink-muted)] pl-1 pt-2";

  return (
    <main className="min-h-screen bg-[var(--canvas)] px-6 py-10">
      <div className="max-w-2xl mx-auto">
        <header className="mb-6">
          <h1 className="font-serif text-4xl font-semibold text-[var(--ink)]">
            Settings
          </h1>
        </header>

        <SettingsSectionNav />

        <div className="space-y-10">
          {/* PROFILE */}
          <section id="profile" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Profile</h2>

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Profile
              </h3>
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

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Graduation year
              </h3>
              <SettingsForm
                currentYear={user.graduationYear ?? new Date().getFullYear() + 4}
              />
            </Card>
          </section>

          {/* APPEARANCE */}
          <section id="appearance" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Appearance</h2>

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Theme
              </h3>
              <p className="font-serif text-base text-[var(--ink-muted)]">
                Light, dark, or follow your system.
              </p>
              <ThemeToggle variant="settings" />
            </Card>

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Distance unit
              </h3>
              <p className="font-serif text-base text-[var(--ink-muted)]">
                Used across the training planner, completion dialog, and stats.
                Stored data stays in kilometers; only the display converts.
              </p>
              <DistanceUnitToggle value={currentDistanceUnit} />
            </Card>
          </section>

          {/* INTEGRATIONS */}
          <section id="integrations" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Integrations</h2>

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Calendar
              </h3>
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
          </section>

          {/* VOICE */}
          <section id="voice" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Voice</h2>
            <VoiceSettingsSection />
          </section>

          {/* JARVIS */}
          <section id="jarvis" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>JARVIS</h2>

            <Card className={tile}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
                  <Brain className="h-4 w-4" />
                </span>
                <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                  Memory
                </h3>
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

            <Card className={tile}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
                  <Network className="h-4 w-4" />
                </span>
                <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                  Personal context
                </h3>
              </div>
              <p className="font-serif text-base text-[var(--ink-muted)]">
                See the snapshot of you that external agents read — and rebuild
                it on demand without waiting for the nightly refresh.
              </p>
              <Link
                href="/settings/context"
                className="inline-flex items-center font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
              >
                View snapshot →
              </Link>
            </Card>
          </section>

          {/* DEVICES */}
          <section id="devices" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Devices</h2>

            <Card className={tile}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
                  <Laptop className="h-4 w-4" />
                </span>
                <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                  Desktop devices
                </h3>
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
          </section>

          {/* TOKENS */}
          <section id="tokens" className="space-y-4 scroll-mt-24">
            <h2 className={sectionHeader}>Tokens</h2>

            <Card className={tile}>
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-md border border-[var(--edge)] bg-[var(--canvas)] text-[var(--ink-amber)] shadow-[inset_1px_1px_2px_color-mix(in_oklch,var(--ink)_10%,transparent),inset_-1px_-1px_2px_color-mix(in_oklch,white_70%,transparent)]">
                  <KeyRound className="h-4 w-4" />
                </span>
                <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                  MCP tokens
                </h3>
              </div>
              <p className="font-serif text-base text-[var(--ink-muted)]">
                Mint a bearer token for Claude Desktop, Claude Code, or
                claude.ai to read your personal context via MCP. Revoke anytime.
              </p>
              <Link
                href="/settings/mcp-tokens"
                className="inline-flex items-center font-mono text-xs uppercase tracking-[0.08em] text-[var(--ink-muted)] hover:text-[var(--ink)] transition-colors duration-150 ease-out cursor-pointer-always"
              >
                Manage tokens →
              </Link>
            </Card>
          </section>

          {/* ACCOUNT */}
          <section id="account" className="space-y-4 scroll-mt-24 pb-16">
            <h2 className={sectionHeader}>Account</h2>

            <Card className={tile}>
              <h3 className="font-serif text-2xl font-semibold text-[var(--ink)]">
                Sign out
              </h3>
              <SignOutButton />
            </Card>
          </section>
        </div>
      </div>
    </main>
  );
}
