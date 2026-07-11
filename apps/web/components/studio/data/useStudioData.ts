"use client";

/**
 * useStudioData.ts — The Studio · data-bridge (context + slice types)
 *
 * The context object every studio consumer reads in RENDER (never per-frame).
 * It exposes only PLAIN DATA (no callbacks) so nothing tempts a per-frame read.
 * Context identity changes only when a constituent changes (Realtime cadence).
 *
 * The provider (`StudioDataProvider`) mounts ABOVE the R3F <Canvas>. On R3F v9
 * parent React context is bridged into the Canvas root automatically, so ONE
 * provider serves BOTH the in-Canvas `widget-cloud` and the DOM `focus-overlay`.
 */
import { createContext, useContext } from "react";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { GcalConnectionStatus } from "@/lib/db/queries/gcal-connection";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";
import type { GcalCalendarMeta } from "@/lib/gcal/calendars";
// The bench-data slices reuse the 2D server actions' return types verbatim
// (type-only imports — no server code is pulled into the client bundle).
// `getHabitCompletionsInRange` is imported as a type-only binding purely to
// derive its row shape.
import type {
  HabitWithAreas,
  getHabitCompletionsInRange,
} from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { HashtagWithCount } from "@/app/actions/hashtags";
import type { ProjectRow } from "@/app/actions/projects";
import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { PersonWithStats } from "@/lib/db/queries/people";

/** The eight studio widgets, in canonical tile order. */
export const STUDIO_WIDGET_ORDER = [
  "tasks",
  "captures",
  "agenda",
  "habits",
  "journal",
  "projects",
  "areas",
  "people",
] as const satisfies readonly string[];

/**
 * The eight studio widget ids, derived from the canonical order above so the
 * order is the single source of truth. Appending an id here automatically
 * extends every exhaustive consumer (`TINTS`, `WIDGET_REGISTRY`, paging).
 */
export type StudioWidgetId = (typeof STUDIO_WIDGET_ORDER)[number];

/**
 * Uniform tile projection — `widget-cloud` maps all tiles off this
 * generically. Each field is pre-computed/pre-truncated so a tile is a dumb
 * renderer of strings + a badge + a state token. A pure `useMemo` selector over
 * the same context produces this (never a second query).
 */
export interface StudioTileSummary {
  id: StudioWidgetId;
  label: string; // "Tasks", "Captures", "Agenda", "Habits", "Journal", …
  badge: number | null; // count chip; null = no badge
  headline: string | null; // next/latest item, pre-truncated
  subline: string | null; // secondary line, e.g. "3 due today", "2/5 done"
  state: "ok" | "empty" | "attention"; // attention: gcal expired/not_connected
}

/** One habit-completion row, as the 2D `getHabitCompletionsInRange` returns it. */
export type HabitCompletionRow = Awaited<
  ReturnType<typeof getHabitCompletionsInRange>
>[number];

/**
 * The calendar slice. A PURE projection of live gcal data through the existing
 * fetch layer — never a parallel store (gcal is the only source of truth for
 * events; nothing is mirrored in Postgres). The Agenda overlay consumes it.
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
 * SSR seed for the calendar slice: a superset of `CalendarData` that also
 * carries the resolved visible-calendar ids so the client query key matches the
 * SSR fetch exactly and the seed hydrates the client `useQuery` with no extra
 * round-trip. `CalendarData` itself stays the frozen shape.
 */
export interface CalendarSeed extends CalendarData {
  visibleCalendarIds: string[]; // persisted pref, else all calendars
}

/**
 * The habits slice. Habits + today's trailing completion window, keyed exactly
 * like the 2D `/habits` client. `windowStart` is derived from the provider's
 * `todayYmd` minute clock — no new interval.
 */
export interface HabitsData {
  habits: HabitWithAreas[]; // tableKey("habits", userId)
  completions: HabitCompletionRow[]; // [...tableKey("habit_completions"), windowStart, today]
  windowStart: string; // ymd, derived from todayYmd
}

/**
 * The journal slice. Today's entry only, keyed `["journaling", userId, today]`
 * exactly like the 2D client.
 */
export interface JournalTodayData {
  entry: JournalEntry | null;
}

/**
 * One SSR seed object (replaces the world provider's loose props). The `/studio`
 * page builds this via `loadStudioSeed(userId)` and passes it whole to the
 * provider, which hydrates each shared-key query with no extra round-trip.
 */
export interface StudioSeed {
  tasks: TaskWithProjects[];
  captures: CaptureWithLinks[];
  calendar: CalendarSeed;
  habits: HabitWithAreas[];
  habitCompletions: HabitCompletionRow[];
  journal: JournalEntry | null;
}

export interface StudioData {
  userId: string;
  todayYmd: string;
  tasks: TaskWithProjects[];
  captures: CaptureWithLinks[];
  hashtags: HashtagWithCount[]; // tag chips for the Captures overlay
  calendar: CalendarData;
  habits: HabitsData;
  journal: JournalTodayData;
  // Wave-5 ambient widgets — plain real-data slices keyed off the same
  // TanStack Query caches the 2D pages use (no SSR seed; hashtags precedent).
  projects: ProjectRow[]; // tableKey("projects", userId)
  areas: SidebarArea[]; // tableKey("areas", userId), active-only
  people: PersonWithStats[]; // tableKey("people", userId)
}

export const StudioDataContext = createContext<StudioData | null>(null);

export function useStudioData(): StudioData {
  const ctx = useContext(StudioDataContext);
  if (ctx === null) {
    throw new Error(
      "useStudioData() must be called inside a <StudioDataProvider>. " +
        "The provider mounts above the R3F <Canvas>; both the in-Canvas " +
        "widget-cloud and the DOM focus-overlay read it in render.",
    );
  }
  return ctx;
}
