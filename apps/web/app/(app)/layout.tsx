import { and, eq, isNull } from "drizzle-orm";
import { getAuthAvatar, getUserOrRedirect } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { AppShell } from "@/components/shell/AppShell";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { GlobalHotkeys } from "@/components/shell/GlobalHotkeys";
import { ShortcutsCheatSheet } from "@/components/shell/ShortcutsCheatSheet";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { JarvisListenerMount } from "@/components/voice/JarvisListenerMount";
import { FloatingJarvisStatus } from "@/components/voice/FloatingJarvisStatus";
import { GlobalJarvisHandler } from "@/components/jarvis/GlobalJarvisHandler";
import { JarvisWarmer } from "@/components/jarvis/JarvisWarmer";
import { PhysicalExtensionListener } from "@/components/voice/PhysicalExtensionListener";
import { Toaster } from "sonner";
import { NuqsAdapter } from "nuqs/adapters/next/app";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single AUTH-03 gate: validates session via getClaims; redirects unauthenticated to /sign-in.
  // Per-page calls to requireOnboarded() handle the onboarding redirect downstream.
  const user = await getUserOrRedirect();

  // Fetch sidebar + composer data server-side in parallel.
  // hashtags + projects feed the Cmd+K composer (single-source-of-truth per D-09).
  const [
    activeAreas,
    allAreas,
    hashtagsForComposer,
    projectsForComposer,
    oauthAvatar,
  ] = await Promise.all([
    getSidebarTree(user.id, false),
    getSidebarTree(user.id, true),
    getHashtagSuggestions(user.id),
    db
      .select({
        id: projects.id,
        name: projects.name,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
      })
      .from(projects)
      .where(
        and(eq(projects.userId, user.id), isNull(projects.archivedAt)),
      ),
    getAuthAvatar(),
  ]);

  return (
    <NuqsAdapter>
      <QueryProvider>
        <AppShell
          userId={user.id}
          activeAreas={activeAreas}
          allAreas={allAreas}
          graduationYear={user.graduationYear}
          profile={{
            displayName: user.displayName,
            email: user.email,
            avatarUrl: user.avatarUrl,
            oauthAvatarUrl: oauthAvatar.avatarUrl,
          }}
        >
          {children}
        </AppShell>
        {/* Phase 6 Plan 06-03 (AES-05, D-02): Cmd+K focuses JARVIS Console input
            anywhere in (app). CommandMenu rebound to Cmd+Shift+K. */}
        <GlobalHotkeys />
        {/* Capture composer — opens on Cmd+Shift+K (Cmd+K reserved for JARVIS focus) */}
        <CommandMenu
          hashtags={hashtagsForComposer}
          projects={projectsForComposer}
        />
        {/* `?` opens shortcuts cheat sheet (when no input is focused) */}
        <ShortcutsCheatSheet />
        {/* Sonner toast notifications — bottom-right, 4000ms auto-dismiss (UI-SPEC) */}
        <Toaster position="bottom-right" duration={4000} />
        {/* Phase 7 Plan 07-03 — always-mounted voice lifecycle owner.
            JarvisListenerMount is a client wrapper that holds the
            dynamic({ ssr: false }) import (Next 16 forbids ssr:false in RSC).
            Porcupine + vad-react crash SSR (Pitfall 2). */}
        <JarvisListenerMount />
        {/* Phase 7 voice-everywhere — voice transcript handler for pages
            other than /today (where JarvisConsole owns the pipeline). */}
        <GlobalJarvisHandler />
        {/* Phase 7 voice-everywhere — bottom-right HUD pill showing current
            mic FSM state. Always visible when voice is enabled. */}
        <FloatingJarvisStatus />
        {/* Phase 11 / CACHE-04 (D-03) — predictive cache warmer.
            Fires fire-and-forget POST /api/jarvis/warm on app open + JARVIS
            input focus + mic arm. Server-side age-gate (50min) in
            /api/jarvis/warm prevents over-firing; client-side debounce is
            30s per trigger. Renders null. */}
        <JarvisWarmer />
        {/* Physical Extension — when enabled, opens an SSE connection to
            /api/jarvis/physical/events and dispatches a jarvis-wake-fire
            window event when the external hardware wake-word fires.
            JarvisListener listens for that event and dispatches
            WAKE_WORD_DETECTED into the mic FSM. */}
        <PhysicalExtensionListener />
      </QueryProvider>
    </NuqsAdapter>
  );
}
