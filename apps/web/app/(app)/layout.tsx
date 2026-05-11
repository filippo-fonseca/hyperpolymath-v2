import { getUserOrRedirect } from "@/lib/auth/get-user";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { AppShell } from "@/components/shell/AppShell";
import { CommandMenu } from "@/components/shell/CommandMenu";
import { Toaster } from "sonner";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Single AUTH-03 gate: validates session via getClaims; redirects unauthenticated to /sign-in.
  // Per-page calls to requireOnboarded() handle the onboarding redirect downstream.
  const user = await getUserOrRedirect();

  // Fetch sidebar data server-side — two passes: active areas + all areas (for "Show archived")
  const [activeAreas, allAreas] = await Promise.all([
    getSidebarTree(user.id, false),
    getSidebarTree(user.id, true),
  ]);

  return (
    <>
      <AppShell activeAreas={activeAreas} allAreas={allAreas} graduationYear={user.graduationYear}>
        {children}
      </AppShell>
      {/* Global Cmd+K command menu — stub composer in Phase 2; Phase 5 Kiwi replaces content */}
      <CommandMenu />
      {/* Sonner toast notifications — bottom-right, 4000ms auto-dismiss (UI-SPEC) */}
      <Toaster position="bottom-right" duration={4000} />
    </>
  );
}
