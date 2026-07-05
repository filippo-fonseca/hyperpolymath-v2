/**
 * /jarvis — the JARVIS management surface (top-level tab, outside Settings).
 *
 * Two sections tune how the agent behaves:
 *   - Personality: the spoken voice (preset + formality/verbosity/wit dials +
 *     freeform custom instructions), consumed by run-turn.ts at prompt-build.
 *   - Startup & Briefing: mirrors the desktop startup config (spoken briefing
 *     flag, open-on-start list, startup shortcuts), read by the desktop app.
 *
 * Server Component pattern mirrors /settings/routines:
 *   - requireOnboarded() for auth (behind the same (app) auth wrapper)
 *   - a server-side prefetch of both configs for instant first paint
 *   - plain JSON-serializable props down to the "use client" island
 *
 * The config backend (server actions + DB) already exists; this page only
 * consumes getPersonalityConfig / getStartupConfig and hands the fetched
 * values to the client editors, which save via update{Personality,Startup}Config.
 */

import {
  DEFAULT_PERSONALITY_CONFIG,
  DEFAULT_STARTUP_CONFIG,
  type PersonalityConfig,
  type StartupConfig,
} from "@hyperpolymath/jarvis-core";
import { getPersonalityConfig, getStartupConfig } from "@/app/actions/jarvis-config";
import { requireOnboarded } from "@/lib/auth/get-user";
import { JarvisClient } from "./JarvisClient";

export const dynamic = "force-dynamic";

export default async function JarvisPage() {
  await requireOnboarded();

  // Prefetch both configs for SSR initial data. The getters already fall back
  // to the canonical DEFAULT_* config when no row exists, so a success always
  // yields a full object; on failure we seed the defaults and let the user save
  // to create the row — never blow up the page.
  const [personalityRes, startupRes] = await Promise.all([
    getPersonalityConfig(),
    getStartupConfig(),
  ]);

  const initialPersonality: PersonalityConfig = personalityRes.success
    ? personalityRes.data
    : { ...DEFAULT_PERSONALITY_CONFIG };
  const initialStartup: StartupConfig = startupRes.success
    ? startupRes.data
    : { ...DEFAULT_STARTUP_CONFIG };

  return (
    <main className="relative min-h-full bg-[var(--canvas)] text-[var(--ink)]">
      <div className="mx-auto w-full max-w-[860px] px-6 md:px-10 pt-10 pb-16">
        <header className="mb-8">
          <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[var(--ink-muted)]">
            JARVIS · Management
          </p>
          <h1 className="mt-1 font-serif text-3xl font-semibold text-[var(--ink)]">JARVIS</h1>
          <p className="mt-3 max-w-[560px] font-serif text-[16px] leading-[1.55] text-[var(--ink-muted)]">
            Tune how the agent sounds and what it does the moment it wakes. Set a
            personality preset and dials for its spoken voice, then wire up the
            startup briefing, the things it opens on launch, and its shortcuts.
          </p>
        </header>

        <JarvisClient
          initialPersonality={initialPersonality}
          initialStartup={initialStartup}
        />
      </div>
    </main>
  );
}
