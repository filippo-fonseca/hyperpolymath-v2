import Link from "next/link";
import { KeyRound, Laptop, Lightbulb } from "lucide-react";
import { eq } from "drizzle-orm";

import { getAuthAvatar, requireOnboarded } from "@/lib/auth/get-user";
import { ProfileSection } from "@/components/settings/ProfileSection";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { SettingsForm } from "@/components/settings-form";
import { SignOutButton } from "@/components/sign-out-button";
import { DangerZoneSection } from "@/components/settings/DangerZoneSection";
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
  SettingsCard,
  SectionEyebrow,
  CardTitle,
  CardDescription,
} from "@/components/settings/sd-primitives";
import { ApiKeysSection } from "@/components/settings/ApiKeysSection";
import { PagesBackupSection } from "@/components/settings/PagesBackupSection";
import { getPagesBackupSettings } from "@/lib/db/queries/pages-backup";
import { listUserKeyStatus } from "@/lib/byok/keys";
import { GoveeDevicesSection } from "@/components/settings/GoveeDevicesSection";
import { listGoveeDevices } from "@/app/actions/govee-devices";
import { resolveGoveeApiKey } from "@/lib/govee/service";
import {
  getValidGcalToken,
  GcalNotConnectedError,
  GcalTokenRevokedError,
} from "@/lib/gcal/token";
import { listCalendars, type GcalCalendarMeta } from "@/lib/gcal/calendars";

export default async function SettingsPage() {
  const user = await requireOnboarded();
  const [
    gcalStatus,
    oauthAvatar,
    distanceUnitRow,
    apiKeyStatus,
    backupSettings,
    goveeDevicesResult,
    goveeApiKey,
  ] = await Promise.all([
    getGcalConnectionStatus(user.id),
    getAuthAvatar(),
    db
      .select({ unit: users.distanceUnit })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1),
    listUserKeyStatus(user.id),
    getPagesBackupSettings(user.id),
    listGoveeDevices(),
    resolveGoveeApiKey(user.id),
  ]);
  const goveeDevices = goveeDevicesResult.ok ? goveeDevicesResult.data : [];
  const hasGoveeApiKey = goveeApiKey !== null;
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

  const manageLink =
    "inline-flex items-center font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--sd-ink-dull)] hover:text-[var(--sd-ink)] transition-colors duration-150 ease-out cursor-pointer-always";

  return (
    <main className="min-h-screen bg-[var(--sd-app)] px-6 py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-[var(--sd-ink-faint)]">
            Preferences
          </p>
          <h1 className="mt-1 text-[26px] font-semibold tracking-[-0.01em] text-[var(--sd-ink)]">
            Settings
          </h1>
        </header>

        <SettingsSectionNav />

        <div className="space-y-10">
          {/* PROFILE */}
          <section id="profile" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Profile</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle>Profile</CardTitle>
                <CardDescription className="mt-1">{user.email}</CardDescription>
              </div>
              <ProfileSection
                userId={user.id}
                email={user.email}
                initialDisplayName={user.displayName}
                initialBio={user.bio}
                initialAvatarUrl={user.avatarUrl}
                initialGithubUsername={user.githubUsername}
                oauthAvatarUrl={oauthAvatar.avatarUrl}
              />
            </SettingsCard>

            <SettingsCard className="space-y-4">
              <CardTitle>Graduation year</CardTitle>
              <SettingsForm
                currentYear={user.graduationYear ?? new Date().getFullYear() + 4}
              />
            </SettingsCard>
          </section>

          {/* APPEARANCE */}
          <section id="appearance" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Appearance</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle>Theme</CardTitle>
                <CardDescription className="mt-1">
                  Light, dark, or follow your system.
                </CardDescription>
              </div>
              <ThemeToggle variant="settings" />
            </SettingsCard>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle>Distance unit</CardTitle>
                <CardDescription className="mt-1">
                  Used across the training planner, completion dialog, and stats.
                  Stored data stays in kilometers; only the display converts.
                </CardDescription>
              </div>
              <DistanceUnitToggle value={currentDistanceUnit} />
            </SettingsCard>
          </section>

          {/* INTEGRATIONS */}
          <section id="integrations" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Integrations</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <CardTitle>Google</CardTitle>
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
            </SettingsCard>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle>Pages backup</CardTitle>
                <CardDescription className="mt-1">
                  Keep an automatic daily copy of your entire Wiki in Google Drive.
                  Each page is exported as Markdown into a private folder only this
                  app can touch (the <code>drive.file</code> scope). If you
                  connected Google before backups existed, reconnect once to grant
                  Drive permission.
                </CardDescription>
              </div>
              <PagesBackupSection
                settings={backupSettings}
                gcalConnected={gcalStatus === "connected"}
              />
            </SettingsCard>
          </section>

          {/* API KEYS (BYOK) */}
          <section id="api-keys" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>API keys</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle icon={<KeyRound className="h-4 w-4" />}>
                  Provider keys
                </CardTitle>
                <CardDescription className="mt-2">
                  JARVIS and the voice features run on your own paid API keys. They
                  are encrypted at rest and used only for your requests.
                </CardDescription>
              </div>
              <ApiKeysSection status={apiKeyStatus} />
            </SettingsCard>
          </section>

          {/* VOICE */}
          <section id="voice" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Voice</SectionEyebrow>
            <VoiceSettingsSection />
          </section>

          {/* DEVICES */}
          <section id="devices" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Devices</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle icon={<Laptop className="h-4 w-4" />}>
                  Desktop devices
                </CardTitle>
                <CardDescription className="mt-2">
                  Mint a bearer token for the desktop app, then paste it once into
                  the device to pair it. Revoke any device at any time.
                </CardDescription>
              </div>
              <Link href="/settings/desktop" className={manageLink}>
                Manage devices →
              </Link>
            </SettingsCard>

            <div id="govee-lights" className="scroll-mt-24">
              <SettingsCard className="space-y-4">
                <div>
                  <CardTitle icon={<Lightbulb className="h-4 w-4" />}>
                    Govee lights
                  </CardTitle>
                  <CardDescription className="mt-2">
                    Discover and name your Govee smart lights so JARVIS knows
                    which device to control. Requires a Govee API key.
                  </CardDescription>
                </div>
                <GoveeDevicesSection
                  initialDevices={goveeDevices}
                  hasApiKey={hasGoveeApiKey}
                />
              </SettingsCard>
            </div>
          </section>

          {/* TOKENS */}
          <section id="tokens" className="scroll-mt-24 space-y-4">
            <SectionEyebrow>Tokens</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <div>
                <CardTitle icon={<KeyRound className="h-4 w-4" />}>
                  MCP tokens
                </CardTitle>
                <CardDescription className="mt-2">
                  Mint a bearer token for Claude Desktop, Claude Code, or
                  claude.ai to read your personal context via MCP. Revoke anytime.
                </CardDescription>
              </div>
              <Link href="/settings/mcp-tokens" className={manageLink}>
                Manage tokens →
              </Link>
            </SettingsCard>
          </section>

          {/* ACCOUNT */}
          <section id="account" className="scroll-mt-24 space-y-4 pb-16">
            <SectionEyebrow>Account</SectionEyebrow>

            <SettingsCard className="space-y-4">
              <CardTitle>Sign out</CardTitle>
              <SignOutButton />
            </SettingsCard>

            <SettingsCard className="border-[var(--ink-coral)]/30">
              <DangerZoneSection email={user.email} />
            </SettingsCard>
          </section>
        </div>
      </div>
    </main>
  );
}
