import { and, eq, isNull } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { AppShell } from "@/components/shell/AppShell";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { GlobalHotkeys } from "@/components/shell/GlobalHotkeys";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { JarvisListenerMount } from "@/components/voice/JarvisListenerMount";
import { FloatingJarvisStatus } from "@/components/voice/FloatingJarvisStatus";
import { GlobalJarvisHandler } from "@/components/jarvis/GlobalJarvisHandler";
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
  const [activeAreas, allAreas, hashtagsForComposer, projectsForComposer] =
    await Promise.all([
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
    ]);

  return (
    <NuqsAdapter>
      <QueryProvider>
        <AppShell
          userId={user.id}
          activeAreas={activeAreas}
          allAreas={allAreas}
          graduationYear={user.graduationYear}
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
      </QueryProvider>
    </NuqsAdapter>
  );
}
