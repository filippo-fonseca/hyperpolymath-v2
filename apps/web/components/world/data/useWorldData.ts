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
// Phase 3 (W-01): the new bench-data slices reuse the 2D server actions' return
// types verbatim (type-only imports — no server code is pulled into the client
// bundle, and nothing is redeclared). `getHabitCompletionsInRange` is imported
// as a type-only binding purely to derive its row shape.
import type {
  HabitWithAreas,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { HashtagWithCount } from "@/app/actions/hashtags";
import type { EmberSlot, TreeLayoutResult } from "./treeLayout";

/** One habit-completion row, as the 2D `getHabitCompletionsInRange` returns it. */
export type HabitCompletionRow = Awaited<
  ReturnType<typeof getHabitCompletionsInRange>
>[number];

/**
 * The calendar slice of the world data (RENAMED from `meridian`, Phase 3 W-01;
 * shape byte-identical to the Phase-2 M-01 slice). A PURE projection of live
 * gcal data through the existing fetch layer — never a parallel store (gcal is
 * the only source of truth for events; nothing is mirrored in Postgres). The
 * surviving Agenda panel (W-09) consumes it verbatim.
 */
export interface CalendarData {
  status: GcalConnectionStatus; // "connected" | "not_connected" | "expired"
  events: GcalEventDTO[]; // rolling window slice, raw DTOs
  calendars: GcalCalendarMeta[]; // for per-calendar color fallback
  timezone: string; // users.timezone ?? "UTC"
  windowStartMs: number; // loaded slab bounds …
  windowEndMs: number; // … [startOfDay(today)-1d, startOfDay(today)+8d)
}

/**
 * SSR seed for the calendar slice (page → WorldLoader → WorldCanvas →
 * WorldScene → WorldDataProvider). A superset of `CalendarData`: it also
 * carries the resolved visible-calendar ids so the client query key
 * (`worldCalIds`) matches the SSR fetch exactly and the seed hydrates the
 * client `useQuery` with no extra round-trip. `CalendarData` itself stays the
 * frozen shape (no `visibleCalendarIds`).
 */
export interface CalendarSeed extends CalendarData {
  visibleCalendarIds: string[]; // persisted pref, else all calendars
}

/**
 * The habits slice (NEW, Phase 3 W-01 / §3.2). Habits + today's trailing
 * completion window, keyed exactly like the 2D `/habits` client. `windowStart`
 * is derived from the provider's existing `todayYmd` minute clock — no new
 * interval.
 */
export interface HabitsData {
  habits: HabitWithAreas[]; // tableKey("habits", userId)
  completions: HabitCompletionRow[]; // [...tableKey("habit_completions"), windowStart, today]
  windowStart: string; // ymd, derived from todayYmd
}

/**
 * The journal slice (NEW, Phase 3 W-01 / §3.2). Today's entry only (read-only
 * in MVP), keyed `["journaling", userId, todayYmd]` exactly like the 2D client.
 */
export interface JournalTodayData {
  entry: JournalEntry | null; // ["journaling", userId, todayYmd]
}

export interface WorldData {
  userId: string;
  tree: SidebarArea[]; // active areas (the query already excludes archived)
  layout: TreeLayoutResult;
  tasks: TaskWithProjects[];
  emberSlots: EmberSlot[];
  captures: CaptureWithLinks[];
  todayYmd: string;
  calendar: CalendarData; // RENAMED from `meridian` (M-01) — the flat agenda slice
  habits: HabitsData; // NEW (Phase 3 W-01)
  journal: JournalTodayData; // NEW (Phase 3 W-01)
  hashtags: HashtagWithCount[]; // NEW (Phase 3 W-01) — tag chips for the Captures panel (W-08 reads)
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
