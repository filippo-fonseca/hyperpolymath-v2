"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Sidebar } from "./Sidebar";
import { TopTabBar } from "./TopTabBar";
import { DailyAutoOpen } from "./DailyAutoOpen";
import { JarvisSidePanel } from "./JarvisSidePanel";
import { ProductTour } from "./ProductTour";
import { useSplitScreen } from "@/lib/ui/useSplitScreen";
import { useTasksExpanded } from "@/lib/ui/useTasksExpanded";
import { cn } from "@/lib/utils";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

interface Props {
  userId: string;
  activeAreas: SidebarArea[];
  allAreas: SidebarArea[];
  graduationYear?: number | null;
  profile: {
    displayName: string | null;
    email: string;
    avatarUrl: string | null;
    oauthAvatarUrl: string | null;
  };
  children: React.ReactNode;
}

const JARVIS_PATH = "/today";

/**
 * AppShell — sidebar + main column with optional JARVIS side panel.
 *
 * Layout grid: sidebar-left + main-right, unchanged from Phase 6. The main
 * column now stacks the TopTabBar above a content area that may split
 * horizontally when split-screen mode is on: left ~70% (the route) + right
 * ~30% (an embedded JARVIS console). The divider is a 1px hairline, matching
 * macOS/Arc browser split panes.
 *
 * The side panel is suppressed on /today (avoids two JARVIS consoles) and on
 * /onboarding (no chrome there). It also collapses on narrow viewports
 * (< lg) to keep the route legible.
 */
export function AppShell({
  userId,
  activeAreas,
  allAreas,
  graduationYear,
  profile,
  children,
}: Props) {
  const pathname = usePathname() ?? "";
  const { splitOn } = useSplitScreen();
  const { expanded } = useTasksExpanded();
  const reduceMotion = useReducedMotion();
  // Clip the sidebar wrapper ONLY while the fullscreen-collapse width animation
  // is running. At rest we must NOT clip, or the collapsed sidebar's hover
  // overlay (an absolute 260px panel that floats past the 64px rail) gets cut
  // off and trapped behind the main content.
  const [sidebarAnimating, setSidebarAnimating] = useState(false);

  const onJarvis =
    pathname === JARVIS_PATH || pathname.startsWith(JARVIS_PATH + "/");
  const onOnboarding = pathname.startsWith("/onboarding");
  const showPanel = splitOn && !onJarvis && !onOnboarding;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[var(--canvas)] text-[var(--ink)]">
      {/* Product tour — mounts once globally; runs only when hp_tour_pending
          is set in localStorage (written by onboarding-flow before redirect)
          and hp_tour_v1_done is NOT set. Client-side only. */}
      <ProductTour />

      {/* Sidebar collapses to width 0 when tasks fullscreen is on (D-08 /
          UI-SPEC I-6). 200ms ease-out-quart; respects reduced motion. */}
      <AnimatePresence initial={false}>
        {!expanded && (
          <motion.div
            key="sidebar"
            initial={false}
            animate={{ width: "auto", opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={
              reduceMotion
                ? { duration: 0 }
                : { duration: 0.2, ease: [0.25, 1, 0.5, 1] }
            }
            onAnimationStart={() => setSidebarAnimating(true)}
            onAnimationComplete={() => setSidebarAnimating(false)}
            // `relative z-40` lifts the wrapper (and the collapsed-mode hover
            // overlay inside it) above the main content. overflow is clipped
            // only mid-animation; visible at rest so the overlay can escape.
            className={cn(
              "relative z-40 shrink-0",
              sidebarAnimating ? "overflow-hidden" : "overflow-visible"
            )}
          >
            <Sidebar
              userId={userId}
              initialActiveAreas={activeAreas}
              initialAllAreas={allAreas}
              graduationYear={graduationYear}
              profile={profile}
            />
          </motion.div>
        )}
      </AnimatePresence>
      <main className="flex flex-1 flex-col overflow-hidden">
        <DailyAutoOpen userId={userId} />
        <TopTabBar userId={userId} />
        <div className="flex flex-1 overflow-hidden">
          <div className="@container/main flex-1 overflow-auto">{children}</div>
          {showPanel && (
            <aside
              aria-label="JARVIS side panel"
              className="hidden lg:flex w-[30%] min-w-[360px] max-w-[520px] flex-col border-l border-[var(--edge)] bg-[var(--canvas)] overflow-hidden agent-mode-scope"
            >
              <JarvisSidePanel />
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}
