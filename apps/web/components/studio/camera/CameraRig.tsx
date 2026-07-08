"use client";

/**
 * CameraRig — the phase-driven, demand-frame camera controller for The Studio.
 *
 * Renders nothing (zero draw calls). It bridges the U0 phase bus to the live R3F
 * camera through the pure {@link createCameraTraversal} controller:
 *
 *  - `useStudioPhase` feeds every grab/drag/pull event into the controller with
 *    zero React re-renders (the stream fires at frame rate) and demands one frame
 *    per consumed event so the damp loop can chase the new target.
 *  - A `useFrame` damps `camera.position` toward the controller target and
 *    self-invalidates ONLY while unsettled. When it settles (|pos − target| < ε)
 *    it demands nothing, the world sleeps back to 0 rAF, and the PerfGovernor can
 *    rest — the sanctioned demand-frame shape, adding no idle rAF.
 *  - Reset-to-home: an imperative subscription to the camera store (no re-render)
 *    plus an `h`/`Home` keydown affordance guarded against editable targets.
 *
 * Mounted in `StudioScene` at the Wave-2 slot, before `<PostFX/>` (which must
 * stay the last child). It never resets the camera on mount — the controller
 * target starts at the same home the `<Canvas camera>` prop already set.
 */

import { useEffect, useMemo } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  createCameraTraversal,
  type CameraTraversal,
} from "@/lib/studio/camera/traversal";
import { requestCameraHome, subscribeCameraHome } from "@/lib/studio/state/camera";
import { useStudioPhase } from "@/lib/studio/input/react";

// Damping rate (higher = snappier ease) and the settle epsilon (meters). Below
// ε the rig stops demanding frames so the studio can sleep.
const DAMP_LAMBDA = 8;
const SETTLE_EPS = 1e-3;
const SETTLE_EPS_SQ = SETTLE_EPS * SETTLE_EPS;

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable === true;
};

export function CameraRig(): null {
  const invalidate = useThree((s) => s.invalidate);
  const controller = useMemo<CameraTraversal>(() => createCameraTraversal(), []);

  // Feed the controller from the phase bus (zero re-renders); demand a frame per
  // consumed event so the damp loop below chases the freshly-moved target.
  useStudioPhase((phase) => {
    controller.push(phase);
    invalidate();
  });

  // Reset-to-home requests, imperative (no re-render). Each bump sends the camera
  // home; the damp loop animates the return.
  useEffect(
    () =>
      subscribeCameraHome(() => {
        controller.goHome();
        invalidate();
      }),
    [controller, invalidate],
  );

  // Keyboard affordance: `h` / `Home` returns the camera to its spawn vantage.
  // Discrete (fires only on those keys), so it is not an idle invalidation channel.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (isEditableTarget(e.target)) return;
      if (e.key === "h" || e.key === "H" || e.key === "Home") {
        requestCameraHome();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Damp toward the target, self-invalidating only while unsettled. Clamp lives
  // in the controller (the TARGET is clamped, never the damped position), so the
  // camera eases into a rail without jitter.
  useFrame(({ camera }, delta) => {
    const [tx, ty, tz] = controller.getTarget();
    const p = camera.position;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dz = tz - p.z;
    if (dx * dx + dy * dy + dz * dz <= SETTLE_EPS_SQ) return; // settled → sleep
    p.x = THREE.MathUtils.damp(p.x, tx, DAMP_LAMBDA, delta);
    p.y = THREE.MathUtils.damp(p.y, ty, DAMP_LAMBDA, delta);
    p.z = THREE.MathUtils.damp(p.z, tz, DAMP_LAMBDA, delta);
    invalidate();
  });

  return null;
}

export default CameraRig;
