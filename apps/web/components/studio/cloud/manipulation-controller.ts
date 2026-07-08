/**
 * manipulation-controller — the widget grab-drag + pinch-pull STATE MACHINE,
 * extracted from the React hook so it is directly unit-testable (pure closure +
 * three, no React, no jsdom/WebGL). `useWidgetManipulation` is now a thin shell
 * that builds one of these and feeds it the phase bus.
 *
 * It is the SOLE writer of the `widget-transforms` store. During a gesture it
 * mutates the tile's OUTER `THREE.Group` imperatively — the demand-frame
 * doctrine forbids per-frame React re-renders — and commits to the store exactly
 * once per channel, on `grabEnd` / `pullEnd`. Every mutation calls
 * `deps.invalidate()` itself, because hand input dispatches no window events for
 * WidgetCloud's wake listeners to see.
 *
 * Concurrency (see `gesture-core.ts`): the pinch-hold and pinch-pull recognizers
 * are driven from the SAME `pinchActive` signal and reset in lockstep, so on a
 * pinch `pullStart` leads and `grabStart` follows ~250ms later, and on release
 * `grabEnd` and `pullEnd` co-fire in one synchronous tick (hold first). Two
 * invariants fall out and are enforced here by construction rather than trusted:
 *
 *  - A grab OWNS the pull. `grabStart` (re)binds the pull session onto the
 *    grabbed widget at the live delta so a pull already in flight retargets
 *    without popping (see `effectiveScale`). A late `pullStart` must therefore
 *    NOT clobber that binding — it is guarded to no-op while a grab is live.
 *  - `grabEnd` commits the current resize alongside the position, so a settle
 *    render can never orphan a scale that lived only on the group. The co-firing
 *    `pullEnd` re-commits the identical value; the double-settle is idempotent.
 */

import * as THREE from "three";

import { getActiveWidgets } from "@/lib/studio/state/active-widget";
import {
  getWidgetTransform,
  setWidgetTransform,
} from "@/lib/studio/state/widget-transforms";
import { type StudioWidgetId } from "../data/useStudioData";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { resolveSnap, type TileSlot } from "./layout";
import {
  commitScaleValue,
  effectiveScale,
  LIFT,
  resolvePullTarget,
  snapToCommit,
} from "./manipulation-math";

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
  /**
   * The current focus head — the pull's fallback target when no grab owns it.
   * Injected (default reads {@link getActiveWidgets}) so tests stay hermetic.
   */
  getActiveHead: () => StudioWidgetId | null;
}

export interface ManipulationController {
  /** Feed one continuous-phase event through the state machine. */
  handlePhase: (phase: StudioPhaseEvent) => void;
  /** Drop any in-flight session (call on unmount so a remount starts clean). */
  reset: () => void;
}

interface GrabSession {
  targetId: StudioWidgetId;
  /** Widget world position at grab start. */
  startPos: THREE.Vector3;
  /** Camera→widget distance, held constant during the drag (depth stable). */
  camDist: number;
  /** Palm ray point at the first grabMove — the drag anchor. */
  firstPoint: THREE.Vector3;
  anchored: boolean;
}

interface PullSession {
  targetId: StudioWidgetId;
  baseScale: number;
  deltaOffset: number;
}

/** Default {@link ManipulationControllerDeps.getActiveHead}. */
export function activeHead(): StudioWidgetId | null {
  return getActiveWidgets()[0] ?? null;
}

export function createManipulationController(
  deps: ManipulationControllerDeps,
): ManipulationController {
  let grab: GrabSession | null = null;
  let pull: PullSession | null = null;
  let lastPullDelta = 0;

  // Preallocated temps — freeform unprojection allocates nothing per frame.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const point = new THREE.Vector3();

  // Committed scale for a target (store override, else natural 1).
  const committedScale = (id: StudioWidgetId): number =>
    getWidgetTransform(id).scale ?? 1;

  // Apply a target's current effective scale to its group, folding in the grab
  // lift while it is grabbed. Pull-driven if a pull owns this target, else the
  // committed base.
  const applyScale = (id: StudioWidgetId): void => {
    const group = deps.getGroup(id);
    if (!group) return;
    let s =
      pull && pull.targetId === id
        ? effectiveScale(pull.baseScale, lastPullDelta, pull.deltaOffset)
        : committedScale(id);
    if (grab && grab.targetId === id) s *= LIFT;
    group.scale.setScalar(s);
  };

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
        // (Re)bind the pull onto the grabbed widget at the current delta so a
        // pull already in flight retargets without popping.
        pull = {
          targetId: id,
          baseScale: committedScale(id),
          deltaOffset: lastPullDelta,
        };
        applyScale(id); // lift reads immediately
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
          // newPos = startPos + (now − firstPoint)
          group.position.copy(grab.startPos).add(now).sub(grab.firstPoint);
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
        const released: [number, number, number] = group
          ? [group.position.x, group.position.y, group.position.z]
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

        // A grab owns its widget's pull; the live resize exists only on the
        // group. Fold it into the SAME store write as the position so a settle
        // render can't reset scale to the base. The co-firing pullEnd re-commits
        // the identical value (idempotent), and if it never arrives the resize
        // is still safe here. `pull` is left intact so a genuinely-continuing
        // pull keeps driving until its own end.
        const scaleCommit =
          pull && pull.targetId === g.targetId
            ? commitScaleValue(
                effectiveScale(pull.baseScale, lastPullDelta, pull.deltaOffset),
              )
            : undefined;

        if (group) {
          const applied = commitPos ?? anchors[ownIdx]!;
          group.position.set(applied[0], applied[1], applied[2]);
        }
        setWidgetTransform(g.targetId, {
          position: commitPos,
          ...(scaleCommit !== undefined ? { scale: scaleCommit } : {}),
        });

        grab = null;
        applyScale(g.targetId); // drop the lift
        deps.invalidate();
        return;
      }

      case "pullStart": {
        // A grab, once begun, OWNS the pull (bound onto the grabbed widget at
        // grabStart). A late pullStart must not clobber that binding or reset
        // the ramp — repointing onto the active widget would pop the scale.
        // Precedence is grabbed-wins; with a grab in flight there is nothing to
        // bind here.
        if (grab) return;
        lastPullDelta = 0;
        const target = resolvePullTarget(null, deps.getActiveHead());
        pull = target
          ? { targetId: target, baseScale: committedScale(target), deltaOffset: 0 }
          : null;
        return;
      }

      case "pullDelta": {
        lastPullDelta = phase.delta; // track even with no target
        if (!pull) return; // no target → no-op
        applyScale(pull.targetId);
        deps.invalidate();
        return;
      }

      case "pullEnd": {
        const p = pull;
        if (p) {
          const effective = effectiveScale(
            p.baseScale,
            lastPullDelta,
            p.deltaOffset,
          );
          setWidgetTransform(p.targetId, { scale: commitScaleValue(effective) });
          pull = null;
          applyScale(p.targetId); // settle to committed (drops the lift factor)
          deps.invalidate();
        }
        lastPullDelta = 0;
        return;
      }

      // drag* is reserved for a future free-camera rig — ignored here.
      case "dragStart":
      case "dragMove":
      case "dragEnd":
        return;
    }
  };

  const reset = (): void => {
    grab = null;
    pull = null;
    lastPullDelta = 0;
  };

  return { handlePhase, reset };
}
