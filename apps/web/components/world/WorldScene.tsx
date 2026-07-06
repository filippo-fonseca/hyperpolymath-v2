"use client";

import type { SidebarArea } from "@/lib/db/queries/sidebar";
import type { TaskWithProjects } from "@/lib/db/queries/tasks";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

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

export function WorldScene(_props: WorldSceneProps): React.ReactElement {
  return (
    <>
      {/* ── Data bridge (U-04) ──────────────────────────────────────────────
          Later: <WorldDataProvider {...props}> wraps everything below so scene
          systems read the shared TanStack Query caches. For now props are held
          but unused — the smoke scene needs no data. */}

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

          <CameraRig/>        camera guided flight            [U-07]
          <Atmosphere/>       floor · environment · lights    [U-08]
          <TreeSystem/>       trunk · boughs · lanterns       [U-06, U-10]
          <Embers/>           task ember InstancedMesh        [U-09]
          <Fireflies/>        capture firefly swarm           [U-14]
          <WorldLabels/>      SDF captions                    [U-11]
          <Ledger/>           bottom-center strip             [U-11]
          <TodayPanel/>       uikit today panel               [U-12]
          <JarvisRing/>       ring + ribbon                   [U-13]
          <Litany/>           6s boot sequence                [U-17]
          <PostFX/>           Bloom + Vignette composer       [U-08]
          <PerfGovernor/>     PerformanceMonitor ladder       [U-20] */}
    </>
  );
}
