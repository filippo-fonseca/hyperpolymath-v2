/**
 * manipulation-controller — the widget grab-drag STATE MACHINE, extracted from
 * the React hook so it is directly unit-testable (pure closure + three, no
 * React, no jsdom/WebGL). `useWidgetManipulation` is now a thin shell that
 * builds one of these and feeds it the phase bus.
 *
 * It is the SOLE writer of the `widget-transforms` store. During a grab it
 * mutates the tile's OUTER `THREE.Group` imperatively — the demand-frame
 * doctrine forbids per-frame React re-renders — and commits the settled
 * position to the store exactly once, on `grabEnd`. Every mutation calls
 * `deps.invalidate()` itself, because hand input dispatches no window events for
 * WidgetCloud's wake listeners to see.
 *
 * Widgets render at ONE fixed uniform size — a grab moves a card, it never
 * resizes it. While grabbed the card is lifted by {@link LIFT} on +Y so it
 * reads as picked up; the lift is purely visual (stripped before the snap and
 * before the committed position), so the settled slot never carries it.
 */

import * as THREE from "three";

import {
  getWidgetTransform,
  setWidgetTransform,
} from "@/lib/studio/state/widget-transforms";
import { type StudioWidgetId } from "../data/useStudioData";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { resolveSnap, type TileSlot } from "./layout";
import { LIFT, snapToCommit } from "./manipulation-math";

/**
 * Live inputs the controller reads on every phase event. The hook mutates this
 * object in place each render so the controller (built once) always sees the
 * latest props without being rebuilt — preserving the original "callback reads
 * latest props" semantics. Read fields via `deps.x`, never destructured.
 */
export interface ManipulationControllerDeps {
  /** Default layout slots, in the same order as {@link ManipulationControllerDeps.widgetIds}. */
  slots: readonly TileSlot[];
  /** Widget ids in slot order. */
  widgetIds: readonly StudioWidgetId[];
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

  // Preallocated temps — freeform unprojection allocates nothing per frame.
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
          // newPos = startPos + (now − firstPoint), plus the visual lift.
          group.position.copy(grab.startPos).add(now).sub(grab.firstPoint);
          group.position.y += LIFT;
        }
        deps.invalidate();
        return;
      }

      case "grabEnd": {
        const g = grab;
        if (!g) return;
        const group = deps.getGroup(g.targetId);
        const ownIdx = deps.widgetIds.indexOf(g.targetId);
        const anchors = deps.slots.map((s) => s.position);
        // Strip the visual lift so the snap works on the true resting position.
        const released: [number, number, number] = group
          ? [group.position.x, group.position.y - LIFT, group.position.z]
          : [g.startPos.x, g.startPos.y, g.startPos.z];

        // Other widgets' effective positions (override ?? slot) — snap must not
        // stack onto an occupied anchor.
        const others: [number, number, number][] = [];
        for (let i = 0; i < deps.widgetIds.length; i++) {
          if (i === ownIdx) continue;
          const wid = deps.widgetIds[i]!;
          others.push(getWidgetTransform(wid).position ?? anchors[i]!);
        }

        const snapIdx = resolveSnap(released, anchors, others);
        const commitPos = snapToCommit(snapIdx, ownIdx, anchors, released);

        if (group) {
          const applied = commitPos ?? anchors[ownIdx]!;
          group.position.set(applied[0], applied[1], applied[2]);
        }
        setWidgetTransform(g.targetId, commitPos);

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
    grab = null;
  };

  return { handlePhase, reset };
}
