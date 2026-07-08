"use client";

/**
 * WidgetCloud — the ambient 3D cloud of eight glowing widget tiles.
 *
 * Purely positional: it maps `useStudioSummaries()` (eight pre-truncated tile
 * summaries, stable order) onto the fixed amphitheater arc zones (`arcZoneSlots`)
 * by way of the zone assignment, and renders one `<WidgetTile>` each plus the
 * grab-time `<ZoneMarkers/>`. It owns two seams:
 *
 *  1. The raycast HoverProvider (priority 10). The input hub calls `resolve`
 *     rAF-coalesced on every cursor move; we raycast the eight panel meshes and
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
import { useZoneAssignment } from "@/lib/studio/state/zone-assignment";
import { useStudioSummaries } from "../data/hooks";
import type { StudioWidgetId } from "../data/useStudioData";
import { arcZoneSlots } from "./layout";
import { useWidgetManipulation } from "./useWidgetManipulation";
import { WidgetTile } from "./WidgetTile";
import { ZoneMarkers } from "./ZoneMarkers";

// How long drift runs after interaction. The eight fixed zone slots live in
// layout.ts (arcZoneSlots) so the renderer and the framing math share one source.
const ACTIVE_MS = 4000;

export function WidgetCloud(): React.ReactElement {
  const summaries = useStudioSummaries();
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);

  // The eight fixed amphitheater zone slots (index = zone). The tile renderer and
  // the manipulation controller both resolve positions from this one array, so
  // the visual layout and the drop math can never drift apart.
  const slots = useMemo(() => arcZoneSlots(summaries.length), [summaries.length]);

  // Zone assignment (index = zone → widget id). A tile renders at the slot of its
  // current zone; a drop reflows this array and every displaced tile glides.
  const assignment = useZoneAssignment();

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
  const getGroup = useCallback(
    (id: StudioWidgetId) => groupsRef.current.get(id) ?? null,
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

  // Grab-drag manipulation. Sole writer of the zone-assignment store; it mutates
  // the registered outer groups imperatively during a drag and self-invalidates.
  useWidgetManipulation({ slots, getGroup, camera, invalidate });

  // Channel 1 — data changes: nudge a frame (hooks.ts contract).
  useEffect(() => {
    invalidate();
  }, [summaries, invalidate]);

  // Channel 4 — zone reflow: a drop reflows the assignment and re-renders the
  // displaced tiles with new slot targets; nudge a frame so their damp loops
  // wake and glide under demand-frame.
  useEffect(() => {
    invalidate();
  }, [assignment, invalidate]);

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
      {summaries.map((summary) => {
        const zone = assignment.indexOf(summary.id);
        return (
          <WidgetTile
            key={summary.id}
            summary={summary}
            position={slots[zone]!.position}
            registerMesh={registerMesh}
            registerGroup={registerGroup}
          />
        );
      })}
      {/* Drop-zone outlines: rendered only during a grab, before PostFX. */}
      <ZoneMarkers />
    </group>
  );
}

export default WidgetCloud;
