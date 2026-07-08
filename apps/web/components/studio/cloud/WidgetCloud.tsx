"use client";

/**
 * WidgetCloud — the ambient 3D cloud of five glowing widget tiles.
 *
 * Purely positional: it maps `useStudioSummaries()` (five pre-truncated tile
 * summaries, stable order) over a fibonacci-cap layout and renders one
 * `<WidgetTile>` each. It owns two seams:
 *
 *  1. The raycast HoverProvider (priority 10). The input hub calls `resolve`
 *     rAF-coalesced on every cursor move; we raycast the five panel meshes and
 *     return the hovered widget id. Cursor coords are stage-normalized, and the
 *     stage div ≡ the Canvas rect (StudioLoader), so `nx/ny → NDC` is exact.
 *
 *  2. The demand-frame invalidation (the Canvas is `frameloop="demand"`), on
 *     three explicit channels mirroring DustMotes' active-window doctrine:
 *       (1) data changes nudge one frame;
 *       (2) an interaction "active window" keeps `Float` drifting for 4s, then
 *           the world sleeps and the tiles freeze mid-drift;
 *       (3) hover animation self-invalidates from each tile until it settles.
 */

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { useStudioHoverProvider } from "@/lib/studio/input/react";
import { subscribeWidgetTransforms } from "@/lib/studio/state/widget-transforms";
import { useStudioSummaries } from "../data/hooks";
import type { StudioWidgetId } from "../data/useStudioData";
import { fibonacciCapSlots } from "./layout";
import { WidgetTile } from "./WidgetTile";

// Cap origin and radius (meters), and how long drift runs after interaction.
const CENTER: [number, number, number] = [0, 1.8, 0];
const RADIUS = 2.4;
const CAP_DEG = 70;
const ACTIVE_MS = 4000;

export function WidgetCloud(): React.ReactElement {
  const summaries = useStudioSummaries();
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);

  const slots = useMemo(
    () =>
      fibonacciCapSlots(summaries.length, {
        radius: RADIUS,
        center: CENTER,
        capDeg: CAP_DEG,
      }),
    [summaries.length],
  );

  // Panel-mesh registry. A stable array is kept alongside the map so the
  // per-resolve raycast allocates nothing.
  const meshesRef = useRef(new Map<StudioWidgetId, THREE.Mesh>());
  const meshArrayRef = useRef<THREE.Mesh[]>([]);
  const registerMesh = useCallback(
    (id: StudioWidgetId, mesh: THREE.Mesh | null) => {
      if (mesh) meshesRef.current.set(id, mesh);
      else meshesRef.current.delete(id);
      meshArrayRef.current = [...meshesRef.current.values()];
    },
    [],
  );

  // Outer-group registry. The manipulation controller reads groups by id to
  // mutate position/scale imperatively during a gesture; tiles register/unregister
  // their outer group via `registerGroup`.
  const groupsRef = useRef(new Map<StudioWidgetId, THREE.Group>());
  const registerGroup = useCallback(
    (id: StudioWidgetId, group: THREE.Group | null) => {
      if (group) groupsRef.current.set(id, group);
      else groupsRef.current.delete(id);
    },
    [],
  );

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);

  useStudioHoverProvider({
    id: "widget-cloud-raycast",
    priority: 10, // 3D raycast wins over DOM rects (priority 0) per types.ts
    resolve: (cursor) => {
      if (!cursor.active) return null;
      ndc.set(cursor.nx * 2 - 1, -(cursor.ny * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObjects(meshArrayRef.current, false);
      return hits.length > 0
        ? (hits[0]!.object.userData.widgetId as string)
        : null;
    },
  });

  // Channel 1 — data changes: nudge a frame (hooks.ts contract).
  useEffect(() => {
    invalidate();
  }, [summaries, invalidate]);

  // Channel 4 — transform commits: a committed override (grab/pull settle)
  // re-renders one tile; nudge a frame so it actually draws under demand-frame.
  useEffect(
    () => subscribeWidgetTransforms(() => invalidate()),
    [invalidate],
  );

  // Channel 2 — Float drift: keep an active window open on any interaction, and
  // demand frames only while it lasts. When it closes the cloud freezes.
  const activeUntilRef = useRef(0);
  useEffect(() => {
    const wake = () => {
      activeUntilRef.current = performance.now() + ACTIVE_MS;
      invalidate();
    };
    wake();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("pointermove", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
    };
  }, [invalidate]);

  useFrame(() => {
    if (performance.now() < activeUntilRef.current) invalidate();
  });

  // Channel 3 (hover animation) lives inside each WidgetTile's own useFrame.

  return (
    <group>
      {summaries.map((summary, i) => (
        <WidgetTile
          key={summary.id}
          summary={summary}
          position={slots[i]!.position}
          registerMesh={registerMesh}
          registerGroup={registerGroup}
        />
      ))}
    </group>
  );
}

export default WidgetCloud;
