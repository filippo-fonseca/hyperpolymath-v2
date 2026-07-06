"use client";

/**
 * useWorldData.ts — U-04 · The Studiolo · data-bridge
 *
 * The context object every scene system reads in RENDER (never per-frame). It
 * exposes only PLAIN DATA (no callbacks) so nothing tempts a per-frame read;
 * `useFrame` animation belongs to wave-2+ units. Context identity changes only
 * when a constituent changes (Realtime cadence).
 */
import { createContext, useContext } from "react";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { EmberSlot, TreeLayoutResult } from "./treeLayout";

export interface WorldData {
  userId: string;
  tree: SidebarArea[]; // active areas (the query already excludes archived)
  layout: TreeLayoutResult;
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];
  captures: CaptureWithLinks[];
  todayYmd: string;
}

export const WorldDataContext = createContext<WorldData | null>(null);

export function useWorldData(): WorldData {
  const ctx = useContext(WorldDataContext);
  if (ctx === null) {
    throw new Error(
      "useWorldData() must be called inside a <WorldDataProvider>. " +
        "The provider lives inside <Canvas>; scene systems read it in render.",
    );
  }
  return ctx;
}
