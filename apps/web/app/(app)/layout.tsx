import { GlobalJarvisDialog } from "@/components/jarvis/GlobalJarvisDialog";
import { GlobalJarvisHandler } from "@/components/jarvis/GlobalJarvisHandler";
import { JarvisWarmer } from "@/components/jarvis/JarvisWarmer";
import { CurrentUserProvider } from "@/components/providers/CurrentUserProvider";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { SearchProvider } from "@/components/search/SearchProvider";
import { AppShell } from "@/components/shell/AppShell";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { GlobalHotkeys } from "@/components/shell/GlobalHotkeys";
import { NavHistoryProvider } from "@/components/shell/NavHistoryProvider";
import { ShortcutsCheatSheet } from "@/components/shell/ShortcutsCheatSheet";
import { FloatingJarvisStatus } from "@/components/voice/FloatingJarvisStatus";
import { JarvisListenerMount } from "@/components/voice/JarvisListenerMount";
import { PhysicalExtensionListener } from "@/components/voice/PhysicalExtensionListener";
import { getAuthAvatar, getUserOrRedirect } from "@/lib/auth/get-user";
import { db } from "@/lib/db";
import { getHashtagSuggestionsCached, getSidebarTreeCached } from "@/lib/db/cached";
import { projects } from "@/lib/db/schema";
import { getSearchSnapshot } from "@/lib/search/snapshot";
import { and, eq, isNull } from "drizzle-orm";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { Toaster } from "sonner";

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
    searchSnapshot,
  ] = await Promise.all([
    getSidebarTreeCached(user.id, false),
    getSidebarTreeCached(user.id, true),
    getHashtagSuggestionsCached(user.id),
    db
      .select({
        id: projects.id,
        name: projects.name,
        isClass: projects.isClass,
        courseCode: projects.courseCode,
      })
      .from(projects)
      .where(and(eq(projects.userId, user.id), isNull(projects.archivedAt))),
    getAuthAvatar(),
    getSearchSnapshot(user.id),
  ]);

  return (
    <NuqsAdapter>
      <QueryProvider>
        {/* Publishes user.id to client leaves (entity pills key their label
            cache on it) without threading it through every component between. */}
        <CurrentUserProvider userId={user.id}>
          <SearchProvider userId={user.id} initialSnapshot={searchSnapshot}>
            {/* NavHistoryProvider — in-memory Back/Forward stack. Must wrap both
            AppShell (TopTabBar → NavArrows) and GlobalHotkeys (⌘[ / ⌘]). */}
            <NavHistoryProvider>
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
            </NavHistoryProvider>
            {/* Quick 260607-g56: Cmd+K opens a lite JARVIS dialog from any (app)
            route EXCEPT /today (where GlobalHotkeys.focusJarvis wins). */}
            <GlobalJarvisDialog />
            {/* Capture composer — opens on Cmd+Shift+K (Cmd+K reserved for JARVIS focus) */}
            <CommandMenu hashtags={hashtagsForComposer} projects={projectsForComposer} />
            {/* `?` opens shortcuts cheat sheet (when no input is focused) */}
            <ShortcutsCheatSheet />
            {/* Sonner toast notifications — bottom-right, 4000ms auto-dismiss (UI-SPEC).
            sd register: solid --sd-box surface, hairline --sd-line, no blur (see .sd-toast). */}
            <Toaster
              position="bottom-right"
              duration={4000}
              toastOptions={{ className: "sd-toast" }}
            />
            {/* Phase 7 Plan 07-03 — always-mounted voice lifecycle owner.
            JarvisListenerMount is a client wrapper that holds the
            dynamic({ ssr: false }) import (Next 16 forbids ssr:false in RSC).
            Porcupine + vad-react crash SSR (Pitfall 2). */}
            <JarvisListenerMount />
            {/* Phase 7 voice-everywhere — voice transcript handler for pages
            other than /today (where JarvisConsole owns the pipeline). */}
            <GlobalJarvisHandler userId={user.id} />
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
          </SearchProvider>
        </CurrentUserProvider>
      </QueryProvider>
    </NuqsAdapter>
  );
}
