import { and, eq, isNull } from "drizzle-orm";
import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { db } from "@/lib/db";
import { projects } from "@/lib/db/schema";
import { AppShell } from "@/components/shell/AppShell";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { QueryProvider } from "@/components/providers/QueryProvider";
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
        {/* Global Cmd+K command menu — Phase 5 will swap CommandMenuContent for the Kiwi UI */}
        <CommandMenu
          hashtags={hashtagsForComposer}
          projects={projectsForComposer}
        />
        {/* Sonner toast notifications — bottom-right, 4000ms auto-dismiss (UI-SPEC) */}
        <Toaster position="bottom-right" duration={4000} />
      </QueryProvider>
    </NuqsAdapter>
  );
}
