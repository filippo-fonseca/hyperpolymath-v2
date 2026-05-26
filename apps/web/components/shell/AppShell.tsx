"use client";

import { Sidebar } from "./Sidebar";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  userId: string;
  activeAreas: SidebarArea[];
  allAreas: SidebarArea[];
  graduationYear?: number | null;
  /** Profile snapshot forwarded to the sidebar chip. */
  profile: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
    oauthAvatarUrl: string | null;
  };
  children: React.ReactNode;
}

/**
 * Phase 6.1 Plan 06.1-05 (UI-SPEC §14 carry-forward, §5e diplomatic chrome):
 *
 * Layout grid is unchanged from Phase 6 — `proxy.ts` and route compositions
 * depend on the sidebar-left + main-right structure. ONLY the chrome
 * typography + edge treatment carries to the children. Background reads
 * directly from --canvas (not Tailwind's bg-background alias) so the
 * journal-paper surface is explicit and there is no neumorphic shadow.
 */
export function AppShell({
  userId,
  activeAreas,
  allAreas,
  graduationYear,
  profile,
  children,
}: Props) {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      <Sidebar
        userId={userId}
        initialActiveAreas={activeAreas}
        initialAllAreas={allAreas}
        graduationYear={graduationYear}
        profile={profile}
      />
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
