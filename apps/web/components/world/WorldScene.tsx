"use client";

import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";
import { WorldDataProvider } from "./data/WorldDataProvider";

/**
 * WorldScene — the composition root of The Studiolo (U-02 scaffold).
 *
 * This is the shared integration point: every later work-unit mounts its
 * system here as a single-line insertion at the marked slots below. Keep it
 * minimal and clean — no logic lives in this file, only composition.
 *
 * For THIS unit it renders a smoke-test scene (a dim ambient light + one small
 * emissive placeholder mesh) so that navigating to /world visibly renders
 * something inside the Canvas without depending on any unbuilt system.
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
      {/* Dim ambient so the placeholder is visible against the #120E0B clear. */}
      <ambientLight intensity={0.4} color="#F2E9D8" />

      {/* ── Smoke-test placeholder ──────────────────────────────────────────
          A single small emissive candle-point at the vestibule center. Removed
          once real geography (U-06) mounts. Emissive + toneMapped:false so the
          later Bloom composer (U-08) will pick it up. */}
      <mesh position={[0, 1.6, 0]}>
        <sphereGeometry args={[0.15, 16, 12]} />
        <meshStandardMaterial
          color="#E8C46B"
          emissive="#E8C46B"
          emissiveIntensity={2}
          toneMapped={false}
        />
      </mesh>

      {/* ── Mount slots for later work-units (one-line insertions) ──────────
          Wired at wave boundaries by the orchestrator; keep this list current.

          Wave 2: <CameraRig/> [U-07] · <Atmosphere/> + <PostFX/> [U-08]
                  <Trunk/> + <Boughs/> [U-06] · <Lanterns/> [U-10] · <Embers/> [U-09]
          Wave 3: <Fireflies/> [U-14] · <WorldLabels/> + <Ledger/> [U-11]
                  <TodayPanel/> [U-12] · <JarvisRing/> [U-13]
          Wave 4: <Litany/> [U-17]
          Wave 5: <PerfGovernor/> [U-20] */}
    </WorldDataProvider>
  );
}
