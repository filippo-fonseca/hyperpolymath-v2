"use client";

import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { HabitWithAreas } from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { CalendarSeed, HabitCompletionRow } from "./data/useStudioData";
import { StudioDataProvider } from "./data/StudioDataProvider";
import { StudioAtmosphere } from "./env/StudioAtmosphere";
import { DustMotes } from "./env/DustMotes";
import { PostFX } from "./env/PostFX";
import { PerfGovernor } from "./perf/PerfGovernor";

/**
 * StudioScene — the composition root of The Studio (Wave-1 scaffold).
 *
 * The shared integration point: each Wave-2 work-unit mounts its system here as
 * a single-line insertion at the marked slot below. Keep it minimal — no logic
 * lives in this file, only composition.
 *
 * Wave 1 wires only the empty room: the data bridge, atmosphere, dust, the perf
 * governor, and the single PostFX composer. The widget cloud, focus overlay,
 * and input/camera rig are hung here by later waves.
 */
export interface StudioSceneProps {
  userId: string;
  initialTree: SidebarArea[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
  initialCalendar: CalendarSeed;
  initialHabits: HabitWithAreas[];
  initialHabitCompletions: HabitCompletionRow[];
  initialJournal: JournalEntry | null;
}

export function StudioScene(props: StudioSceneProps): React.ReactElement {
  return (
    // The data bridge wraps the whole scene INSIDE <Canvas> so every system
    // reads the shared TanStack Query caches via useStudioData().
    <StudioDataProvider
      userId={props.userId}
      initialTree={props.initialTree}
      initialTasks={props.initialTasks}
      initialCaptures={props.initialCaptures}
      initialCalendar={props.initialCalendar}
      initialHabits={props.initialHabits}
      initialHabitCompletions={props.initialHabitCompletions}
      initialJournal={props.initialJournal}
    >
      <StudioAtmosphere /> {/* night IBL · candle key · moon fill */}
      <DustMotes /> {/* drifting motes (own draw call) */}
      {/* ── WAVE-2 MOUNT SLOTS — one-line insertions, keep this list current ──
          <WidgetCloud />    [widget-cloud]     — mounts here
          <FocusOverlay />   [focus-overlay]    — mounts here
          input/camera rig   [studio-input-core] — mounts here
          <PostFX/> MUST remain the LAST child (single EffectComposer wraps all). */}
      <PerfGovernor /> {/* adaptive-resolution governor — 0 draw calls, 0 idle rAF */}
      <PostFX /> {/* the ONLY EffectComposer — MUST stay last */}
    </StudioDataProvider>
  );
}
