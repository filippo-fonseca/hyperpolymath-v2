/**
 * manipulation-controller — the widget grab-drag STATE MACHINE, extracted from
 * the React hook so it is directly unit-testable (pure closure + three, no
 * React, no jsdom/WebGL). `useWidgetManipulation` is now a thin shell that
 * builds one of these and feeds it the phase bus.
 *
 * It is the SOLE writer of the `zone-assignment` store, on both channels:
 *  - DnD (`setDndState`) — updated through the drag as the nearest zone flips
 *    (change-gated), and cleared to idle on drop/reset. Drives ZoneMarkers.
 *  - ASSIGNMENT (`moveWidgetToZone`) — committed once, on `grabEnd`: the held
 *    card drops into the nearest zone slot and every other card reflows via
 *    insert-and-shift.
 *
 * During a grab it mutates the tile's OUTER `THREE.Group` imperatively — the
 * demand-frame doctrine forbids per-frame React re-renders — and every mutation
 * calls `deps.invalidate()` itself, because hand input dispatches no window
 * events for WidgetCloud's wake listeners to see.
 *
 * Widgets render at ONE fixed uniform size — a grab moves a card between zones,
 * it never resizes it. While grabbed the card is lifted by {@link LIFT} on +Y so
 * it reads as picked up; the lift is purely visual (stripped before the nearest-
 * zone test and before the card lands), so the settled slot never carries it.
 */

import * as THREE from "three";

import { moveWidgetToZone, setDndState } from "@/lib/studio/state/zone-assignment";
import { type StudioWidgetId } from "../data/useStudioData";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { nearestZone, type TileSlot } from "./layout";
import { LIFT } from "./manipulation-math";

/**
 * Live inputs the controller reads on every phase event. The hook mutates this
 * object in place each render so the controller (built once) always sees the
 * latest props without being rebuilt — preserving the original "callback reads
 * latest props" semantics. Read fields via `deps.x`, never destructured.
 */
export interface ManipulationControllerDeps {
  /** Zone slot centers, indexed by zone. The drop target is the nearest of these. */
  slots: readonly TileSlot[];
  /** Resolve a tile's registered OUTER group (the imperative write target). */
  getGroup: (id: StudioWidgetId) => THREE.Group | null;
  /** The fixed scene camera (for freeform unprojection). */
  camera: THREE.Camera;
  /** Demand a frame. */
  invalidate: () => void;
}

export interface ManipulationController {
  /** Feed one continuous-phase event through the state machine. */
  handlePhase: (phase: StudioPhaseEvent) => void;
  /** Drop any in-flight session (call on unmount so a remount starts clean). */
  reset: () => void;
}

interface GrabSession {
  targetId: StudioWidgetId;
  /** Widget world position at grab start (unlifted). */
  startPos: THREE.Vector3;
  /** Camera→widget distance, held constant during the drag (depth stable). */
  camDist: number;
  /** Palm ray point at the first grabMove — the drag anchor. */
  firstPoint: THREE.Vector3;
  anchored: boolean;
}

export function createManipulationController(
  deps: ManipulationControllerDeps,
): ManipulationController {
  let grab: GrabSession | null = null;

  // Preallocated temps for the per-frame unprojection (rayPoint): the frame loop
  // allocates nothing. (grabStart still allocates one session object per grab.)
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const point = new THREE.Vector3();

  // Palm NDC → world point at the drag's held camera distance.
  const rayPoint = (nx: number, ny: number, dist: number): THREE.Vector3 => {
    ndc.set(nx * 2 - 1, -(ny * 2 - 1));
    raycaster.setFromCamera(ndc, deps.camera);
    return point
      .copy(raycaster.ray.direction)
      .multiplyScalar(dist)
      .add(raycaster.ray.origin);
  };

  const handlePhase = (phase: StudioPhaseEvent): void => {
    switch (phase.type) {
      case "grabStart": {
        const id = phase.targetId as StudioWidgetId;
        const group = deps.getGroup(id);
        if (!group) return; // unknown/unregistered target → ignore
        grab = {
          targetId: id,
          startPos: group.position.clone(),
          camDist: deps.camera.position.distanceTo(group.position),
          firstPoint: new THREE.Vector3(),
          anchored: false,
        };
        group.position.y += LIFT; // read as picked up (purely visual)
        // Light the markers immediately, highlighting the card's current zone.
        setDndState(
          id,
          nearestZone(
            [grab.startPos.x, grab.startPos.y, grab.startPos.z],
            deps.slots,
          ),
        );
        deps.invalidate();
        return;
      }

      case "grabMove": {
        if (!grab) return; // orphan move → no-op
        const now = rayPoint(phase.nx, phase.ny, grab.camDist);
        if (!grab.anchored) {
          grab.firstPoint.copy(now); // anchor the first move; no jump at grab start
          grab.anchored = true;
          return;
        }
        const group = deps.getGroup(grab.targetId);
        if (group) {
          // newPos = startPos + (now − firstPoint); the visual lift is added
          // AFTER the nearest-zone test so +Y lift never biases the row choice.
          group.position.copy(grab.startPos).add(now).sub(grab.firstPoint);
          const zone = nearestZone(
            [group.position.x, group.position.y, group.position.z],
            deps.slots,
          );
          group.position.y += LIFT;
          setDndState(grab.targetId, zone); // change-gated inside the store
        }
        deps.invalidate();
        return;
      }

      case "grabEnd": {
        const g = grab;
        if (!g) return;
        const group = deps.getGroup(g.targetId);
        // Strip the visual lift so the drop lands on the true resting position.
        const released: [number, number, number] = group
          ? [group.position.x, group.position.y - LIFT, group.position.z]
          : [g.startPos.x, g.startPos.y, g.startPos.z];

        const zone = nearestZone(released, deps.slots);
        moveWidgetToZone(g.targetId, zone); // commit the drop; reflow the board

        // Landing has a SINGLE owner: the reflow re-render hands the dropped tile
        // its new slot as `position`, and `setDndState(null, null)` below un-grabs
        // it, so its own damp glides it home from the release point — exactly like
        // every other displaced card. No imperative position set here: two writers
        // of the same landing point are only incidentally correct while the slot
        // mapping is identity, whereas the damp glide stays authoritative.

        setDndState(null, null); // drag over → markers off
        grab = null;
        deps.invalidate();
        return;
      }

      // drag* is reserved for the free-camera rig — ignored here.
      case "dragStart":
      case "dragMove":
      case "dragEnd":
        return;
    }
  };

  const reset = (): void => {
    if (grab) setDndState(null, null); // clear a dangling highlight on unmount
    grab = null;
  };

  return { handlePhase, reset };
}
