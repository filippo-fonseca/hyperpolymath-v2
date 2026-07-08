/**
 * traversal.ts — grab-the-world camera traversal controller (pure, unit-tested).
 *
 * A framework-free state machine in the exact mold of the input recognizers: it
 * consumes {@link StudioPhaseEvent}s from the U0 phase bus and maintains a single
 * clamped camera *target* position. The R3F `<CameraRig>` damps the live camera
 * toward that target every frame; this module owns none of three/R3F, so every
 * behavior below is a synthetic-event unit test with zero jsdom.
 *
 * Semantics ("grab-the-world" — the hand drags the world, so the camera moves
 * opposite along pan and dollies with palm depth):
 *  - `dx,dy` are CUMULATIVE normalized cursor deltas from the drag origin (U0
 *    contract). `ny` grows downward, so a downward hand yields `dy > 0`.
 *  - `dz` is the cumulative `ln(palmSize)` delta: hand toward the camera ⇒ palm
 *    bigger ⇒ `dz > 0` ⇒ dolly IN.
 *  - Because deltas are cumulative, the target is recomputed from a snapshotted
 *    baseline each move (anchoring, not integration) — drift-free, and a dropped
 *    frame costs nothing.
 *
 * Grab yield: during a pinch the hub streams `dragStart` immediately but only
 * upgrades to `grabStart` ~250 ms later once it knows the pinch began over a
 * widget. On `grabStart` the controller reverts the accidental pan and suppresses
 * the rest of that drag lifecycle, keeping camera traversal and widget grabs
 * mutually exclusive without forking the U0 intent contract. `pull*` is ignored.
 */

import type { StudioPhaseEvent } from "@/lib/studio/input/types";

export type Vec3 = [number, number, number];

/**
 * Camera home. MUST match the `<Canvas camera={{ position }}>` in
 * {@link StudioCanvas} so `goHome()` returns to the exact spawn vantage.
 */
export const CAMERA_HOME: Vec3 = [0, 1.6, 6];

export interface CameraTraversalConfig {
  /** Meters of camera pan per unit of cumulative normalized drag (X axis). */
  panGainX: number;
  /** Meters of camera pan per unit of cumulative normalized drag (Y axis). */
  panGainY: number;
  /** Meters of dolly per unit of cumulative `ln(palmSize)` delta. */
  dollyGain: number;
  /** Inclusive AABB rail for camera X (meters). */
  boundsX: [number, number];
  /** Inclusive AABB rail for camera Y (meters). */
  boundsY: [number, number];
  /** Inclusive AABB rail for camera Z (meters). */
  boundsZ: [number, number];
  /** Home / spawn target. */
  home: Vec3;
}

/**
 * Principled starting constants (tunable live by the rig owner):
 *  - `panGain ≈ 6` ⇒ a full-stage drag pans ~6 m.
 *  - `dollyGain ≈ 4` ⇒ one palm-size doubling (ln 2) dollies ~2.8 m.
 *  - `z ∈ [3.2, 9]` keeps the camera ≥0.8 m clear of the nearest tile face
 *    (cap radius 2.4 around `[0,1.8,0]`) and on the +Z side the cap layout
 *    assumes; `y ≥ 0.6` stays above any future floor; the rails prevent runaway.
 */
export const DEFAULT_CAMERA_TRAVERSAL_CONFIG: CameraTraversalConfig = {
  panGainX: 6,
  panGainY: 6,
  dollyGain: 4,
  boundsX: [-3.5, 3.5],
  boundsY: [0.6, 3.2],
  boundsZ: [3.2, 9],
  home: CAMERA_HOME,
};

export interface CameraTraversal {
  /** Feed one phase-bus event. Only `drag*` moves the camera; `grabStart`
   *  yields; `grabMove`/`grabEnd`/`pull*` are ignored. */
  push(phase: StudioPhaseEvent): void;
  /** The current clamped target `[x,y,z]`. Read-only; the rig damps toward it. */
  getTarget(): Readonly<Vec3>;
  /** Send the camera home and re-anchor there (the rig damps the return). */
  goHome(): void;
  /** Full reset to home, clearing any in-progress drag (test/re-init hook). */
  reset(): void;
}

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Create a camera-traversal controller. Deterministic and side-effect-free —
 * the same event stream always produces the same target.
 */
export function createCameraTraversal(
  config: CameraTraversalConfig = DEFAULT_CAMERA_TRAVERSAL_CONFIG,
): CameraTraversal {
  const { home } = config;

  // `target` is what the rig damps toward; `base` is the committed anchor that
  // cumulative deltas are measured from (snapshotted on dragStart / dragEnd).
  let target: Vec3 = [home[0], home[1], home[2]];
  let base: Vec3 = [home[0], home[1], home[2]];
  let dragging = false;
  // Set when a widget grab is detected mid-drag; the rest of that drag is the
  // hub's grab, not a camera pan. Cleared on the terminal `dragEnd`.
  let suppressed = false;

  const toHome = (): void => {
    target = [home[0], home[1], home[2]];
    base = [home[0], home[1], home[2]];
    dragging = false;
    suppressed = false;
  };

  return {
    push(phase: StudioPhaseEvent): void {
      switch (phase.type) {
        case "dragStart": {
          dragging = true;
          suppressed = false;
          base = [target[0], target[1], target[2]];
          break;
        }
        case "dragMove": {
          if (!dragging || suppressed) break;
          // Grab-the-world signs: hand right (dx>0) ⇒ camera LEFT; hand down
          // (dy>0, ny grows down) ⇒ camera UP; hand toward (dz>0) ⇒ dolly IN.
          // Per-axis clamp so a railed axis never poisons the others.
          target = [
            clamp(base[0] - phase.dx * config.panGainX, config.boundsX[0], config.boundsX[1]),
            clamp(base[1] + phase.dy * config.panGainY, config.boundsY[0], config.boundsY[1]),
            clamp(base[2] - phase.dz * config.dollyGain, config.boundsZ[0], config.boundsZ[1]),
          ];
          break;
        }
        case "dragEnd": {
          if (!dragging) break;
          // Commit: the (possibly reverted) target becomes the new baseline.
          base = [target[0], target[1], target[2]];
          dragging = false;
          suppressed = false;
          break;
        }
        case "grabStart": {
          // The hub only delivers a targetful grab once it knows the pinch began
          // over a widget. Undo the ≤250 ms of accidental pan and yield the rest
          // of this drag lifecycle to the widget grab.
          if (!dragging) break;
          target = [base[0], base[1], base[2]];
          suppressed = true;
          break;
        }
        default:
          // grabMove / grabEnd / pullStart / pullDelta / pullEnd — not ours.
          break;
      }
    },
    getTarget(): Readonly<Vec3> {
      // Defensive copy: never hand out the live anchor array, so a consumer can
      // never alias-corrupt `target` (the `Readonly` is compile-time only).
      return [target[0], target[1], target[2]];
    },
    goHome(): void {
      toHome();
    },
    reset(): void {
      toHome();
    },
  };
}
