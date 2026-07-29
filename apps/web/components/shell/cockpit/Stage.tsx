"use client";

import { DailyAutoOpen } from "@/components/shell/DailyAutoOpen";
import { TopTabBar } from "@/components/shell/TopTabBar";
import { JarvisCommandBar } from "@/components/shell/cockpit/JarvisCommandBar";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/**
 * STAGE — track two of the cockpit (SDC-1 §2.1), and the only zone that swaps
 * on navigation.
 *
 * It is a flex column: the tab bar on top, the scroll container in the middle,
 * the JARVIS command bar pinned at the bottom. Because those are flex siblings
 * rather than overlays, nothing pinned to the stage can ever cover route
 * content, fight a sticky editor toolbar, or collide with a BlockNote menu:
 * everything that scrolls lives inside the middle box and simply has less
 * viewport.
 *
 * The scroll container is moved here verbatim, and its class set is not
 * negotiable. It carries the app's ONLY `@container/main`, so every
 * `@3xl/main` and `@4xl/main` variant in the kanban board, the kanban column
 * and the LifeOS bento grid resolves against it. Renaming it or re-boxing it
 * breaks three features silently and without a type error.
 */
export function Stage({
  userId,
  onWikiHome,
  children,
}: {
  userId: string;
  /** The wiki home owns its own scroll, so the stage must not add a second one. */
  onWikiHome: boolean;
  children: ReactNode;
}) {
  return (
    <main className="craft-sheet flex min-w-0 flex-col overflow-hidden rounded-panel">
      <DailyAutoOpen userId={userId} />
      <TopTabBar userId={userId} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <div
          className={cn(
            "@container/main min-h-0 flex-1",
            onWikiHome ? "h-full overflow-hidden" : "overflow-auto"
          )}
        >
          {children}
        </div>
      </div>
      <JarvisCommandBar />
    </main>
  );
}
