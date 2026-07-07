/**
 * /jarvis — the centralized JARVIS command surface (top-level tab).
 *
 * Everything JARVIS lives here now. A neumorphic section rail switches between:
 *   - Routines: author trigger → ordered smart-block sequences (moved out of
 *     Settings). CRUD flows through app/actions/routines.ts + TanStack Query.
 *   - Personality: the spoken voice (preset + formality/verbosity/wit dials +
 *     freeform custom instructions), consumed by run-turn.ts at prompt-build.
 *   - Startup & Briefing: mirrors the desktop startup config (spoken briefing
 *     flag, open-on-start list, startup shortcuts), read by the desktop app.
 * Plus quick links out to the agent's Memory ledger and Personal Context.
 *
 * Server Component pattern:
 *   - requireOnboarded() for auth (behind the same (app) auth wrapper)
 *   - a server-side prefetch of all configs + the routines list for instant
 *     first paint
 *   - plain JSON-serializable props down to the "use client" island
 *   - ?section= deep-link seeds the initial rail selection (e.g. the
 *     /settings/routines redirect lands on the Routines section)
 */

import { getPersonalityConfig, getStartupConfig } from "@/app/actions/jarvis-config";
import { listRoutines } from "@/app/actions/routines";
import { requireOnboarded } from "@/lib/auth/get-user";
import {
  DEFAULT_PERSONALITY_CONFIG,
  DEFAULT_STARTUP_CONFIG,
  type PersonalityConfig,
  type Routine,
  type StartupConfig,
} from "@hyperpolymath/jarvis-core";
import { JarvisClient, type JarvisSection } from "./JarvisClient";

export const dynamic = "force-dynamic";

const VALID_SECTIONS: readonly JarvisSection[] = ["routines", "personality", "startup"];

function resolveSection(raw: string | string[] | undefined): JarvisSection {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return VALID_SECTIONS.includes(value as JarvisSection) ? (value as JarvisSection) : "routines";
}

export default async function JarvisPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const [user, { section }] = await Promise.all([requireOnboarded(), searchParams]);

  // Prefetch everything for SSR initial data. The config getters fall back to
  // the canonical DEFAULT_* config when no row exists; the routines list falls
  // back to empty — never blow up the page on a partial failure.
  const [personalityRes, startupRes, routinesRes] = await Promise.all([
    getPersonalityConfig(),
    getStartupConfig(),
    listRoutines(),
  ]);

  const initialPersonality: PersonalityConfig = personalityRes.success
    ? personalityRes.data
    : { ...DEFAULT_PERSONALITY_CONFIG };
  const initialStartup: StartupConfig = startupRes.success
    ? startupRes.data
    : { ...DEFAULT_STARTUP_CONFIG };
  const initialRoutines: Routine[] = routinesRes.success ? routinesRes.data : [];

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[1160px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            JARVIS · Command
          </p>
          <h1 className="mt-1 font-serif text-4xl font-semibold text-[var(--ink)]">JARVIS</h1>
          <p className="mt-3 max-w-[600px] font-serif text-[16px] leading-[1.55] text-[var(--ink-muted)]">
            One home for the agent. Compose routines, shape its spoken voice, and set what it does
            the moment it wakes — plus jump to everything it remembers about you.
          </p>
        </header>

        <JarvisClient
          userId={user.id}
          initialSection={resolveSection(section)}
          initialPersonality={initialPersonality}
          initialStartup={initialStartup}
          initialRoutines={initialRoutines}
        />
      </div>
    </main>
  );
}
