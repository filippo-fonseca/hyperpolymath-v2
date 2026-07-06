"use client";

/**
 * CameraRig.tsx — U-07 · The Studiolo · camera-rig
 *
 * The FEEL unit. The camera is the user's body. Every choice here serves one
 * sentence: guided flight, never free-look, never nausea (PLAN §1.6).
 *
 * CameraRig is a LOGIC component: it renders `<CameraControls/>` and nothing
 * visible (zero draw calls, zero geometry). It owns:
 *   - the single `<CameraControls>` instance (truck/pan disabled → guided flight);
 *   - the module-level `cameraBus` singleton (the ONLY way the camera relocates);
 *   - the ONE `focus → pose → flyTo` translation (nobody else flies for focus);
 *   - the `boot-complete` gate (ignore navigation until the Litany finishes);
 *   - the single world keydown listener (mounted via `useWorldKeys`).
 *
 * Idle discipline (PLAN §7): no `useFrame` here, no polling, no heartbeat. After
 * a glide settles, NOTHING in this unit demands frames — the world truly sleeps
 * under `frameloop="demand"`.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * THE HOVER CONVENTION (U-07). Hover is each object family's job (U-06 boughs,
 * U-10 lanterns, U-09 embers); U-07 defines the ONE sanctioned pattern so every
 * family feels identical. No shared hover bus for MVP — hover never crosses
 * component boundaries (U-11's caption singleton subscribes to pointer events on
 * its own). Per hoverable object/instance:
 *
 *   const hoverTarget = useRef(0);            // 0 = rest, 1 = hovered — a TARGET
 *   const invalidate = useThree((s) => s.invalidate);
 *
 *   <mesh
 *     onPointerOver={(e) => { e.stopPropagation(); hoverTarget.current = 1;
 *                             document.body.style.cursor = "pointer"; invalidate(); }}
 *     onPointerOut={() => { hoverTarget.current = 0;
 *                           document.body.style.cursor = ""; invalidate(); }}
 *   />
 *
 *   useFrame((_, delta) => {
 *     const mat = matRef.current;
 *     const goal = BASE_EMISSIVE + EMISSIVE_LIFT * hoverTarget.current; // 0.9 → 1.5
 *     const moving = easing.damp(mat, "emissiveIntensity", goal, 0.1, delta); // maath
 *     if (moving) invalidate();   // demand frames ONLY while settling; stop at rest
 *   });
 *
 * Rules, exactly:
 *   1. `hoverTarget` is a REF holding a goal, mutated in pointer handlers. NEVER
 *      `useState` — a hover must not re-render anything (PLAN §7.4).
 *   2. `maath`'s `easing.damp(obj, key, goal, smoothTime, delta)` runs in the
 *      object's OWN `useFrame`. `smoothTime = 0.1` ⇒ lift within ~100 ms. `damp`
 *      returns `true` while moving — feed that into `invalidate()` so the settle
 *      self-sustains under demand mode and stops the moment it converges.
 *   3. Both pointer handlers call `invalidate()` once (under demand mode the
 *      handler fires but nothing repaints without a kick).
 *   4. Cursor affordance: set `document.body.style.cursor` directly ("pointer" /
 *      "") in the same handlers — keeps the no-React-state rule intact.
 *   5. Hover lean (lanterns tilt 2–3°): same pattern, second damp
 *      (`easing.dampE(group.rotation, [0,0,leanRad*hoverTarget.current], 0.12,
 *      delta)`) OR'd into the same `moving` flag.
 *   6. Instanced families (embers, lanterns) key the target by `e.instanceId`: a
 *      preallocated `Float32Array` of targets, damped per-instance in the
 *      family's single `useFrame`. Same convention, vectorized.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, type ReactElement, type RefObject } from "react";
import { useThree } from "@react-three/fiber";
// `CameraControlsImpl` is drei's public re-export of its transitive `camera-controls`
// dep (drei/core/CameraControls) — imported from drei so bundler resolution finds
// it WITHOUT adding `camera-controls` to package.json. `CameraControls` is the
// component; `CameraControlsImpl` is the class (its `.ACTION` static + instance type).
import { CameraControls, CameraControlsImpl } from "@react-three/drei";
import type { CameraBus, CameraPose } from "../data/diffing";
import { worldEvents } from "../data/diffing";
import { useWorldData } from "../data/useWorldData";
import type { LanternLayout, TreeLayoutResult } from "../data/treeLayout";
import { boughFocusPose } from "../tree/Boughs";
import { focusStack, useFocusStack, type FocusLevel } from "./useFocusStack";
import { useWorldKeys } from "./useWorldKeys";

// ── Timing model (§1.3) ─────────────────────────────────────────────────────
// `camera-controls` transitions are SmoothDamp toward the target, governed by
// `smoothTime` (approx time to close most of the gap; felt arrival ≈ 2×). So
// `smoothTime = 0.35` ⇒ a ~700 ms felt glide (PLAN's 600–900 ms comfort window).
const DEFAULT_SMOOTH_TIME = 0.35; // ≈700 ms felt glide
const SMOOTH_TIME_MIN = 0.3; // ms=600 → 0.30
const SMOOTH_TIME_MAX = 0.45; // ms=900 → 0.45

const READING_DIST = 1.2; // m from lantern center — read a caption, no scale shock
const READING_LIFT = 0.25; // m above the lantern — slight downward gaze

const POSE_STORAGE_KEY = "world:cameraPose"; // U-15 seam (restore-on-mount)
const BOOT_FAILSAFE_MS = 8000; // litany is 6s; wake the world if the event is lost

// ── Module-level singletons (cameraBus can't read React refs) ───────────────
let controlsInstance: CameraControlsImpl | null = null;
let invalidateWorld: () => void = () => {};
let flightSeq = 0; // monotonically increasing flight token

// ── Frozen vestibule pose (§2.4) ────────────────────────────────────────────
export const VESTIBULE_POSE: CameraPose = {
  position: [0, 1.6, 6], // matches WorldCanvas.tsx camera seed exactly
  target: [0, 2.2, 0], // eye-line drifts up the trunk toward the bough crown
};

// ── Small pure helpers ──────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Reduced-motion seam (§5.3). U-19 later rewires this single function to
 * `useWorldPrefs`; keep it a named module function so U-19's diff is one line.
 */
function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/**
 * Reading-distance pose for a lantern (§2.5). The camera sits slightly OUTSIDE
 * the lantern (radially away from the trunk) looking back at it, so the trunk
 * and other boughs stay in frame behind — the user never loses the room. Reused
 * by U-10's hero swap and U-16's landing shots.
 */
export function lanternFocusPose(l: LanternLayout): CameraPose {
  const [px, py, pz] = l.position;
  const h = Math.hypot(px, pz); // horizontal distance from trunk axis
  const ux = h > 1e-4 ? px / h : 0; // outward radial unit vector (XZ)
  const uz = h > 1e-4 ? pz / h : 1; // degenerate lantern-on-axis → face +z
  return {
    position: [px + READING_DIST * ux, py + READING_LIFT, pz + READING_DIST * uz],
    target: [px, py, pz],
  };
}

// ── The boot gate (§3.4) — single source of truth ───────────────────────────
let _bootDone = false;
/** True once worldEvents 'boot-complete' fired (or the 8s failsafe elapsed). */
export function bootDone(): boolean {
  return _bootDone;
}

// ── The cameraBus (§1.3) — implements CameraBus from data/diffing.ts ─────────
export const cameraBus: CameraBus = {
  async flyTo(pose: CameraPose, ms = 700): Promise<void> {
    const c = controlsInstance;
    if (c === null) return; // world unmounted mid-choreography: no-op, resolve
    const id = ++flightSeq;

    const smooth = !prefersReducedMotion(); // reduced motion ⇒ instant cut
    c.smoothTime = clamp(ms / 2000, SMOOTH_TIME_MIN, SMOOTH_TIME_MAX);
    try {
      const transition = c.setLookAt(
        pose.position[0],
        pose.position[1],
        pose.position[2],
        pose.target[0],
        pose.target[1],
        pose.target[2],
        smooth,
      );
      invalidateWorld(); // one kick frame — drei's control events self-sustain the loop
      // Failsafe: the native promise resolves on the next `rest` event; if a
      // `rest` never fires (controls disposed mid-flight) never deadlock U-16.
      await Promise.race([transition, sleep(ms + 2000)]);
    } finally {
      // Only the WINNING flight restores DEFAULT_SMOOTH_TIME; an interrupted
      // flight's finally sees id !== flightSeq and skips the restore.
      if (id === flightSeq) c.smoothTime = DEFAULT_SMOOTH_TIME;
    }
  },
};

/** Resolve a focus level to a camera pose, or null if the target vanished. */
function poseForFocus(
  f: FocusLevel,
  layout: TreeLayoutResult,
): CameraPose | null {
  switch (f.kind) {
    case "vestibule":
      return VESTIBULE_POSE;
    case "bough": {
      const b = layout.byArea.get(f.areaId);
      return b ? boughFocusPose(b) : null;
    }
    case "lantern": {
      const l = layout.byProject.get(f.projectId);
      return l ? lanternFocusPose(l) : null;
    }
  }
}

interface CameraRigProps {
  controlsRef?: RefObject<CameraControlsImpl | null>;
}

export function CameraRig(props?: CameraRigProps): ReactElement {
  const internalRef = useRef<CameraControlsImpl | null>(null);
  const controlsRef = props?.controlsRef ?? internalRef;
  const invalidate = useThree((s) => s.invalidate);

  const { current } = useFocusStack();
  const { layout } = useWorldData();

  // Mount the single world keydown listener (§3.1) exactly once.
  useWorldKeys();

  // ── Mount effect: publish singletons, guided-flight setup, restore, boot gate ──
  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;

    controlsInstance = c;
    invalidateWorld = invalidate;

    // Disable truck/pan — guided flight: the user orbits and dollies, never
    // strafes off into the void (§1.1).
    c.mouseButtons.right = CameraControlsImpl.ACTION.NONE;
    c.mouseButtons.middle = CameraControlsImpl.ACTION.DOLLY;
    c.touches.two = CameraControlsImpl.ACTION.TOUCH_DOLLY; // no two-finger truck
    c.touches.three = CameraControlsImpl.ACTION.NONE;

    // Pose restore (§1.4 · U-15 seam). Before the first demanded frame: restore
    // a saved pose instantly, else fix the vestibule TARGET (the canvas seed only
    // sets position; default target is origin, which aims the horizon too low).
    let restored = false;
    try {
      const raw = sessionStorage.getItem(POSE_STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as CameraPose;
        c.setLookAt(
          p.position[0],
          p.position[1],
          p.position[2],
          p.target[0],
          p.target[1],
          p.target[2],
          false,
        );
        restored = true;
      }
    } catch {
      // ignore malformed storage — fall through to the vestibule
    }
    if (!restored) {
      c.setLookAt(
        VESTIBULE_POSE.position[0],
        VESTIBULE_POSE.position[1],
        VESTIBULE_POSE.position[2],
        VESTIBULE_POSE.target[0],
        VESTIBULE_POSE.target[1],
        VESTIBULE_POSE.target[2],
        false,
      );
    }

    // Boot gate (§3.4). Failsafe first so the subscription can clear it.
    const failsafe = setTimeout(() => {
      _bootDone = true;
      if (process.env.NODE_ENV !== "production") {
        console.warn(
          "[CameraRig] boot-complete failsafe fired (8s) — waking the world",
        );
      }
    }, BOOT_FAILSAFE_MS);

    const off = worldEvents.on("boot-complete", () => {
      // Ordering matters: reset to vestibule FIRST (so any click-during-boot
      // focus is discarded and the world wakes at the dais), THEN flip the flag.
      focusStack.reset();
      _bootDone = true;
      clearTimeout(failsafe);
    });

    return () => {
      off();
      clearTimeout(failsafe);
      controlsInstance = null;
      invalidateWorld = () => {};
      // Do NOT reset _bootDone: same-session revisits skip the litany (U-17).
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Focus → pose → flyTo: the ONLY flight authority for focus (§2.3) ──────
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      // Vestibule at mount = already there (§1.4, instant setLookAt above). Skip
      // the mount flight but consume the flag regardless of the boot gate so the
      // first REAL navigation is never swallowed.
      isInitialMount.current = false;
      return;
    }
    if (!bootDone()) return; // gate: ignore navigation until the Litany finishes
    const pose = poseForFocus(current, layout);
    if (pose === null) {
      // Stale focus (area/project deleted via Realtime) — fall back to base.
      focusStack.reset();
      return;
    }
    void cameraBus.flyTo(pose, 700);
  }, [current, layout]);

  return (
    <CameraControls
      ref={controlsRef}
      makeDefault
      smoothTime={DEFAULT_SMOOTH_TIME}
      draggingSmoothTime={0.12}
      minDistance={1}
      maxDistance={14}
      minPolarAngle={0.15}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}
