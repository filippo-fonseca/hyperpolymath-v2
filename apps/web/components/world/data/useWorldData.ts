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
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
import type { EmberSlot, TreeLayoutResult } from "./treeLayout";

/**
 * The Meridian Ring's slice of the world data (Phase 2, M-01). A PURE
 * projection of live gcal data through the existing fetch layer — the ring is
 * never a parallel store (gcal is the only source of truth for events; nothing
 * is mirrored in Postgres). Shape frozen at Wave M1 (PHASE-2-PLAN §2.2).
 */
export interface MeridianData {
  status: GcalConnectionStatus; // "connected" | "not_connected" | "expired"
  events: GcalEventDTO[]; // rolling window slice, raw DTOs
  calendars: GcalCalendarMeta[]; // for per-calendar color fallback
  timezone: string; // users.timezone ?? "UTC"
  windowStartMs: number; // loaded slab bounds …
  windowEndMs: number; // … [startOfDay(today)-1d, startOfDay(today)+8d)
}

/**
 * SSR seed for the meridian slice (page → WorldLoader → WorldCanvas →
 * WorldScene → WorldDataProvider). A superset of `MeridianData`: it also
 * carries the resolved visible-calendar ids so the client query key
 * (`worldCalIds`) matches the SSR fetch exactly and the seed hydrates the
 * client `useQuery` with no extra round-trip. `MeridianData` itself stays the
 * frozen §2.2 shape (no `visibleCalendarIds`).
 */
export interface MeridianSeed extends MeridianData {
  visibleCalendarIds: string[]; // persisted pref, else all calendars
}

export interface WorldData {
  userId: string;
  tree: SidebarArea[]; // active areas (the query already excludes archived)
  layout: TreeLayoutResult;
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];
  captures: CaptureWithLinks[];
  todayYmd: string;
  meridian: MeridianData; // NEW (M-01) — the calendar sky, additive
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
