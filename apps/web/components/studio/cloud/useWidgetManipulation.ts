"use client";

/**
 * useWidgetManipulation — grab-drag reposition + pinch-pull resize for the
 * cloud tiles, driven by the U0 phase bus.
 *
 * THE SOLE WRITER of the `widget-transforms` store. It subscribes to the
 * continuous phase bus (`grab*` / `pull*`) via `useStudioPhase` and, during a
 * gesture, mutates the tile's OUTER `THREE.Group` imperatively — the codebase's
 * demand-frame doctrine forbids per-frame React re-renders, so nothing streams
 * through state mid-gesture. It commits to the store exactly once per channel,
 * on `grabEnd` / `pullEnd`; the re-render that triggers sets the tile's props to
 * the values already applied imperatively (idempotent by construction).
 *
 * Because hand input dispatches no window pointer/key events, WidgetCloud's wake
 * listeners never see it — so EVERY mutation here calls `invalidate()` itself to
 * demand a frame.
 *
 * Concurrency note: all three pinch recognizers fire on one pinch. `pullStart`
 * arrives on pinch engage; `grabStart` ~250ms later (after the hold threshold).
 * So a pull is usually in flight before a grab — the pull session is rebased
 * onto the grabbed widget at the current delta so retargeting never pops (see
 * `manipulation-math.effectiveScale`).
 */

import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";

import { useStudioPhase } from "@/lib/studio/input/react";
import type { StudioPhaseEvent } from "@/lib/studio/input/types";
import { getActiveWidgets } from "@/lib/studio/state/active-widget";
import {
  getWidgetTransform,
  setWidgetTransform,
} from "@/lib/studio/state/widget-transforms";
import { type StudioWidgetId } from "../data/useStudioData";
import { resolveSnap, type TileSlot } from "./layout";
import {
  commitScaleValue,
  effectiveScale,
  LIFT,
  snapToCommit,
} from "./manipulation-math";

export interface WidgetManipulationParams {
  /** Default layout slots, in the same order as {@link widgetIds}. */
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

export function useWidgetManipulation({
  slots,
  widgetIds,
  getGroup,
  camera,
  invalidate,
}: WidgetManipulationParams): void {
  const grabRef = useRef<GrabSession | null>(null);
  const pullRef = useRef<PullSession | null>(null);
  const lastPullDeltaRef = useRef(0);

  // Preallocated temps — freeform unprojection allocates nothing per frame.
  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const point = useMemo(() => new THREE.Vector3(), []);

  useStudioPhase((phase: StudioPhaseEvent) => {
    // Committed scale for a target (store override, else natural 1).
    const committedScale = (id: StudioWidgetId): number =>
      getWidgetTransform(id).scale ?? 1;

    // Apply a target's current effective scale to its group, folding in the
    // grab lift while it is grabbed. Pull-driven if a pull owns this target,
    // else the committed base.
    const applyScale = (id: StudioWidgetId): void => {
      const group = getGroup(id);
      if (!group) return;
      const p = pullRef.current;
      let s =
        p && p.targetId === id
          ? effectiveScale(p.baseScale, lastPullDeltaRef.current, p.deltaOffset)
          : committedScale(id);
      const g = grabRef.current;
      if (g && g.targetId === id) s *= LIFT;
      group.scale.setScalar(s);
    };

    // Palm NDC → world point at the drag's held camera distance.
    const rayPoint = (nx: number, ny: number, dist: number): THREE.Vector3 => {
      ndc.set(nx * 2 - 1, -(ny * 2 - 1));
      raycaster.setFromCamera(ndc, camera);
      return point
        .copy(raycaster.ray.direction)
        .multiplyScalar(dist)
        .add(raycaster.ray.origin);
    };

    switch (phase.type) {
      case "grabStart": {
        const id = phase.targetId as StudioWidgetId;
        const group = getGroup(id);
        if (!group) return; // unknown/unregistered target → ignore
        grabRef.current = {
          targetId: id,
          startPos: group.position.clone(),
          camDist: camera.position.distanceTo(group.position),
          firstPoint: new THREE.Vector3(),
          anchored: false,
        };
        // (Re)bind the pull onto the grabbed widget at the current delta so a
        // pull already in flight retargets without popping.
        pullRef.current = {
          targetId: id,
          baseScale: committedScale(id),
          deltaOffset: lastPullDeltaRef.current,
        };
        applyScale(id); // lift reads immediately
        invalidate();
        return;
      }

      case "grabMove": {
        const g = grabRef.current;
        if (!g) return; // orphan move → no-op
        const now = rayPoint(phase.nx, phase.ny, g.camDist);
        if (!g.anchored) {
          g.firstPoint.copy(now); // anchor the first move; no jump at grab start
          g.anchored = true;
          return;
        }
        const group = getGroup(g.targetId);
        if (group) {
          // newPos = startPos + (now − firstPoint)
          group.position.copy(g.startPos).add(now).sub(g.firstPoint);
        }
        invalidate();
        return;
      }

      case "grabEnd": {
        const g = grabRef.current;
        if (!g) return;
        const group = getGroup(g.targetId);
        const ownIdx = widgetIds.indexOf(g.targetId);
        const anchors = slots.map((s) => s.position);
        const released: [number, number, number] = group
          ? [group.position.x, group.position.y, group.position.z]
          : [g.startPos.x, g.startPos.y, g.startPos.z];

        // Other widgets' effective positions (override ?? slot) — snap must not
        // stack onto an occupied anchor.
        const others: [number, number, number][] = [];
        for (let i = 0; i < widgetIds.length; i++) {
          if (i === ownIdx) continue;
          const wid = widgetIds[i]!;
          others.push(getWidgetTransform(wid).position ?? anchors[i]!);
        }

        const snapIdx = resolveSnap(released, anchors, others);
        const commitPos = snapToCommit(snapIdx, ownIdx, anchors, released);

        if (group) {
          const applied = commitPos ?? anchors[ownIdx]!;
          group.position.set(applied[0], applied[1], applied[2]);
        }
        setWidgetTransform(g.targetId, { position: commitPos });

        grabRef.current = null;
        applyScale(g.targetId); // drop the lift
        invalidate();
        return;
      }

      case "pullStart": {
        lastPullDeltaRef.current = 0;
        // No grab yet at pinch engage → fall back to the active widget.
        const activeHead = getActiveWidgets()[0] ?? null;
        pullRef.current = activeHead
          ? { targetId: activeHead, baseScale: committedScale(activeHead), deltaOffset: 0 }
          : null;
        return;
      }

      case "pullDelta": {
        lastPullDeltaRef.current = phase.delta; // track even with no target
        const p = pullRef.current;
        if (!p) return; // no target → no-op
        applyScale(p.targetId);
        invalidate();
        return;
      }

      case "pullEnd": {
        const p = pullRef.current;
        if (p) {
          const effective = effectiveScale(
            p.baseScale,
            lastPullDeltaRef.current,
            p.deltaOffset,
          );
          setWidgetTransform(p.targetId, { scale: commitScaleValue(effective) });
          pullRef.current = null;
          applyScale(p.targetId); // settle to committed (drops the lift factor)
          invalidate();
        }
        lastPullDeltaRef.current = 0;
        return;
      }

      // drag* is reserved for a future free-camera rig — ignored here.
      case "dragStart":
      case "dragMove":
      case "dragEnd":
        return;
    }
  });

  // Clear any dangling session refs on unmount so a remount starts clean.
  useEffect(() => {
    return () => {
      grabRef.current = null;
      pullRef.current = null;
      lastPullDeltaRef.current = 0;
    };
  }, []);
}
