"use client";

import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import type { HabitWithAreas } from "@/app/actions/habits";
import type { JournalEntry } from "@/app/actions/journal";
import type { CalendarSeed, HabitCompletionRow } from "./data/useWorldData";
import { WorldDataProvider } from "./data/WorldDataProvider";
import { Atmosphere } from "./env/Atmosphere";
import { DustMotes } from "./env/DustMotes";
import { PostFX } from "./env/PostFX";
import { Trunk } from "./tree/Trunk";
import { Boughs } from "./tree/Boughs";
import { Lanterns } from "./tree/Lanterns";
import { Embers } from "./tree/Embers";
import { Fireflies } from "./tree/Fireflies";
import { CameraRig } from "./camera/CameraRig";
import { WorldLabels } from "./text/WorldLabels";
import { Ledger } from "./text/Ledger";
import { JarvisRing } from "./jarvis/JarvisRing";
import { JarvisChoreographer } from "./jarvis/useJarvisChoreography";
import { Litany } from "./boot/Litany";
import { Chimes } from "./audio/Chimes";
import { PerfGovernor } from "./perf/PerfGovernor";

/**
 * WorldScene — the composition root of The Studiolo (U-02 scaffold).
 *
 * This is the shared integration point: every work-unit mounts its system here
 * as a single-line insertion at the marked slots below. Keep it minimal and
 * clean — no logic lives in this file, only composition.
 *
 * Wave 2 is now assembled: Atmosphere owns lighting + the night environment +
 * floor + brass inlays; the tree (Trunk/Boughs), lanterns, and embers render
 * the live data; CameraRig is the sole flight authority; PostFX is the ONLY
 * EffectComposer and MUST be the last child so it wraps the whole scene.
 */
export interface WorldSceneProps {
  userId: string;
  initialTree: SidebarArea[];
  initialTasks: TaskWithProjects[];
  initialCaptures: CaptureWithLinks[];
  initialCalendar: CalendarSeed;
  initialHabits: HabitWithAreas[];
  initialHabitCompletions: HabitCompletionRow[];
  initialJournal: JournalEntry | null;
}

export function WorldScene(props: WorldSceneProps): React.ReactElement {
  return (
    // The data bridge (U-04) wraps the whole scene INSIDE <Canvas> so every
    // system reads the shared TanStack Query caches via useWorldData(). Mounted
    // at the wave-1 boundary by the orchestrator.
    <WorldDataProvider
      userId={props.userId}
      initialTree={props.initialTree}
      initialTasks={props.initialTasks}
      initialCaptures={props.initialCaptures}
      initialCalendar={props.initialCalendar}
      initialHabits={props.initialHabits}
      initialHabitCompletions={props.initialHabitCompletions}
      initialJournal={props.initialJournal}
    >
      {/* ── Wave 2: the assembled Studiolo ─────────────────────────────────
          Composition-only; each system reads useWorldData() and takes no props.
          Order is deliberate: environment/lighting first, geometry next, the
          camera logic component, and the single composer LAST so Bloom/Vignette
          wrap everything rendered above it. */}
      <Atmosphere /> {/* [U-08] floor · night IBL · key/fill lights · brass inlays */}
      <DustMotes /> {/* [U-08] ~600 drifting motes (own draw call) */}
      <Trunk /> {/* [U-06] dais + trunk column + sap vein */}
      <Boughs /> {/* [U-06] one limb per area (pickable → focus) */}
      <Lanterns /> {/* [U-10] one lantern per project (pickable → focus) */}
      <Fireflies /> {/* [U-14] every unfiled capture as a firefly (one draw call) */}
      <Embers /> {/* [U-09] every task as an ember (two instanced draw calls) */}
      <CameraRig /> {/* [U-07] CameraControls + world keys; sole flight authority */}
      <Chimes /> {/* [U-18] the world's voice — WebAudio, renders null (event-driven) */}
      <WorldLabels /> {/* [U-11] area/project SDF captions (camera-billboarded) */}
      <Ledger /> {/* [U-11] camera-anchored day-at-a-glance HUD strip */}
      {/* [P3 W2 close] <WidgetRig/> mounts here — the bench of WorldPanels replaces the lone TodayPanel */}
      <JarvisChoreographer /> {/* [U-16] routing choreography — resolve→assist→thread+fly */}
      <Litany /> {/* [U-17] boot litany — shutter + greeting, then zero draw calls */}
      <PerfGovernor /> {/* [U-20] adaptive-resolution governor — 0 draw calls, 0 idle rAF */}
      <JarvisRing /> {/* [U-13] the familiar — portaled into the camera; MUST stay just before PostFX */}
      <PostFX /> {/* [U-08] the ONLY EffectComposer — MUST stay last */}

      {/* ── Mount slots for later work-units (one-line insertions) ──────────
          Wired at wave boundaries by the orchestrator; keep this list current.

          Wave 3 (mounted): <Fireflies/> [U-14] · <WorldLabels/> + <Ledger/> [U-11]
                  <TodayPanel/> [U-12] · <JarvisRing/> [U-13]
          Wave 4 (mounted): <JarvisChoreographer/> [U-16] · <Litany/> [U-17]
                  <Chimes/> [U-18]
          Wave 5 (mounted): <PerfGovernor/> [U-20 perf-hardening]
          Remaining (pending): U-21 docs · U-19 reduced-motion (cross-cutting
                  sweep, no new mount)

          NOTE: <PostFX/> must remain the LAST child of the provider — the
          EffectComposer wraps all preceding scene content — and <JarvisRing/>
          (camera portal) sits immediately before it. */}
    </WorldDataProvider>
  );
}
