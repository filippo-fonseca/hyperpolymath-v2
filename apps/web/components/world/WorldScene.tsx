"use client";

import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { WorldDataProvider } from "./data/WorldDataProvider";
import { Atmosphere } from "./env/Atmosphere";
import { DustMotes } from "./env/DustMotes";
import { PostFX } from "./env/PostFX";
import { Trunk } from "./tree/Trunk";
import { Boughs } from "./tree/Boughs";
import { Lanterns } from "./tree/Lanterns";
import { Embers } from "./tree/Embers";
import { CameraRig } from "./camera/CameraRig";

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
      <Embers /> {/* [U-09] every task as an ember (two instanced draw calls) */}
      <CameraRig /> {/* [U-07] CameraControls + world keys; sole flight authority */}
      <PostFX /> {/* [U-08] the ONLY EffectComposer — MUST stay last */}

      {/* ── Mount slots for later work-units (one-line insertions) ──────────
          Wired at wave boundaries by the orchestrator; keep this list current.

          Wave 3 (pending): <Fireflies/> [U-14] · <WorldLabels/> + <Ledger/> [U-11]
                  <TodayPanel/> [U-12] · <JarvisRing/> [U-13]
          Wave 4 (pending): <Litany/> [U-17]
          Wave 5 (pending): <PerfGovernor/> [U-20]

          NOTE: <PostFX/> must remain the LAST child of the provider — the
          EffectComposer wraps all preceding scene content. */}
    </WorldDataProvider>
  );
}
