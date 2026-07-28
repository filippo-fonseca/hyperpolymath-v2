"use client";

import { Sidebar } from "@/components/shell/Sidebar";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import { useTasksExpanded } from "@/lib/ui/useTasksExpanded";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";

/**
 * RAIL — track one of the cockpit (SDC-1 §2.1): feature nav plus the contextual
 * tree for the active feature.
 *
 * This is the same collapse machinery `AppShell` carried before the cockpit
 * restructure, moved verbatim into its own grid item. The track is `auto`, and
 * the Sidebar's own `w-14` / `w-[230px]` transition sizes it; there is no second
 * width animation here, and `sidebar-collapsed` persistence stays inside
 * `Sidebar` where it has always lived.
 *
 * The overflow dance is load-bearing and easy to "clean up" by mistake: the
 * collapsed rail's hover-peek is an absolutely positioned 230px panel that has
 * to float past the 56px rail, so this wrapper must be `overflow-visible` at
 * rest. It is clipped ONLY while the tasks-fullscreen width animation runs,
 * which is the one moment the panel would otherwise smear outside the track.
 */
export function Rail({
  userId,
  activeAreas,
  allAreas,
  graduationYear,
  profile,
}: {
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
}) {
  const { expanded } = useTasksExpanded();
  const reduceMotion = useReducedMotion();
  const [animating, setAnimating] = useState(false);

  return (
    <AnimatePresence initial={false}>
      {!expanded && (
        <motion.div
          key="rail"
          initial={false}
          animate={{ width: "auto", opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={reduceMotion ? { duration: 0 } : { duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          onAnimationStart={() => setAnimating(true)}
          onAnimationComplete={() => setAnimating(false)}
          // `relative z-40` lifts the wrapper (and the collapsed-mode hover
          // overlay inside it) above the stage.
          className={cn("relative z-40 h-full", animating ? "overflow-hidden" : "overflow-visible")}
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
  );
}
