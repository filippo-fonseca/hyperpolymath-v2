"use client";

/**
 * CameraRig — phase-driven demand-frame camera for The Studio.
 *
 * Renders nothing. Bridges the U0 phase bus to the live R3F camera via
 * {@link createCameraTraversal}:
 *  - phase events re-target position; useFrame damps toward the target
 *  - soft look-at toward the amphitheater pivot (or focused widget) so the seat
 *    feels like a theatre, not an orthographic slide
 *  - self-invalidates only while position or look is unsettled
 *  - h/Home reset; focus auto-center via active-widget store
 */

import { useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import {
  createCameraTraversal,
  type CameraTraversal,
} from "@/lib/studio/camera/traversal";
import {
  frameWidgetCamera,
  resolveWidgetWorldPosition,
} from "@/lib/studio/camera/framing";
import { requestCameraHome, subscribeCameraHome } from "@/lib/studio/state/camera";
import {
  getActiveWidgets,
  subscribeActiveWidgets,
} from "@/lib/studio/state/active-widget";
import { useStudioPhase } from "@/lib/studio/input/react";
import { DEFAULT_ARC_ZONES } from "../cloud/layout";

const DAMP_LAMBDA = 8;
const LOOK_LAMBDA = 4.5;
const SETTLE_EPS = 1e-3;
const SETTLE_EPS_SQ = SETTLE_EPS * SETTLE_EPS;
const LOOK_SETTLE_EPS_SQ = 4e-4;

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || typeof el.tagName !== "string") return false;
  const tag = el.tagName.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return true;
  return el.isContentEditable === true;
};

/** Amphitheater stage center — the default "where the room is". */
const PIVOT = new THREE.Vector3(
  DEFAULT_ARC_ZONES.pivot[0],
  DEFAULT_ARC_ZONES.pivot[1] + 0.05,
  DEFAULT_ARC_ZONES.pivot[2],
);

export function CameraRig(): null {
  const invalidate = useThree((s) => s.invalidate);
  const camera = useThree((s) => s.camera);
  const controller = useMemo<CameraTraversal>(() => createCameraTraversal(), []);

  const lookDesired = useRef(PIVOT.clone());
  const lookCurrent = useRef(PIVOT.clone());
  const _tmp = useRef(new THREE.Vector3());

  const refreshLookTarget = (): void => {
    const id = getActiveWidgets()[0];
    const pos = id !== undefined ? resolveWidgetWorldPosition(id) : null;
    if (pos) {
      lookDesired.current.set(pos[0], pos[1], pos[2]);
    } else {
      lookDesired.current.copy(PIVOT);
    }
  };

  useStudioPhase((phase) => {
    if (phase.type === "dragStart") {
      controller.interruptAt([
        camera.position.x,
        camera.position.y,
        camera.position.z,
      ]);
    }
    controller.push(phase);
    invalidate();
  });

  useEffect(
    () =>
      subscribeCameraHome(() => {
        controller.goHome();
        refreshLookTarget();
        invalidate();
      }),
    [controller, invalidate],
  );

  useEffect(() => {
    const apply = (): void => {
      const id = getActiveWidgets()[0];
      const pos = id !== undefined ? resolveWidgetWorldPosition(id) : null;
      if (pos) {
        controller.focusOn(frameWidgetCamera(pos));
      } else {
        controller.endFocus();
      }
      refreshLookTarget();
      invalidate();
    };
    apply();
    return subscribeActiveWidgets(apply);
  }, [controller, invalidate]);

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

  // Seed a theatre pitch on first mount.
  useEffect(() => {
    refreshLookTarget();
    lookCurrent.current.copy(lookDesired.current);
    camera.lookAt(lookCurrent.current);
    invalidate();
  }, [camera, invalidate]);

  useFrame(({ camera }, delta) => {
    const [tx, ty, tz] = controller.getTarget();
    const p = camera.position;
    const dx = tx - p.x;
    const dy = ty - p.y;
    const dz = tz - p.z;
    const posUnsettled = dx * dx + dy * dy + dz * dz > SETTLE_EPS_SQ;

    if (posUnsettled) {
      p.x = THREE.MathUtils.damp(p.x, tx, DAMP_LAMBDA, delta);
      p.y = THREE.MathUtils.damp(p.y, ty, DAMP_LAMBDA, delta);
      p.z = THREE.MathUtils.damp(p.z, tz, DAMP_LAMBDA, delta);
    }

    // Soft look-at: damp a look point toward pivot or focused widget, then aim.
    const desired = lookDesired.current;
    const current = lookCurrent.current;
    const alpha = 1 - Math.exp(-LOOK_LAMBDA * delta);
    current.x += (desired.x - current.x) * alpha;
    current.y += (desired.y - current.y) * alpha;
    current.z += (desired.z - current.z) * alpha;

    // Never look exactly at the camera (singular). Nudge if degenerate.
    const toLook = _tmp.current.subVectors(current, p);
    if (toLook.lengthSq() < 1e-6) {
      current.z -= 0.5;
    }
    camera.lookAt(current);

    const lookDx = desired.x - current.x;
    const lookDy = desired.y - current.y;
    const lookDz = desired.z - current.z;
    const lookUnsettled =
      lookDx * lookDx + lookDy * lookDy + lookDz * lookDz > LOOK_SETTLE_EPS_SQ;

    if (posUnsettled || lookUnsettled) invalidate();
  });

  return null;
}

export default CameraRig;
