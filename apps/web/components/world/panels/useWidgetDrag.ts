"use client";

/**
 * useWidgetDrag.ts — W-07 · The Studiolo · The Bottega (Phase 3) · grab-and-move
 *
 * THE CROWN JEWEL. The drag lifecycle that makes the bench *yours* (PHASE-3-PLAN
 * §4.4, steps 1–5). One hook, called ONCE by `WidgetRig`, owns the phase's ONLY
 * new `useFrame` consumer: self-invalidating WHILE dragging/settling, early-exit
 * to idle-zero the instant the bench comes to rest (§7.3). At rest this hook
 * demands NOTHING — the world truly sleeps under `frameloop="demand"`.
 *
 * ── THE LIFECYCLE (§4.4) ─────────────────────────────────────────────────────
 *  1. GRAB  (`pointerdown` on a panel's frame grip): boot-gated; captures the
 *     pointer on the R3F canvas (`event.target.setPointerCapture`), emits
 *     `widgetBus {drag-start}`, seeds the drag yaw from the grabbed slot's angle,
 *     precomputes the preview layout for every candidate index, and lights the
 *     loop. The rig lifts+tilts the grabbed panel and blooms its frame (see the
 *     `focused` override the rig applies to the dragged id) so it reads picked-up.
 *  2. MOVE  (`pointermove`, delivered to the captured object even off-mesh):
 *     intersect the pointer ray with the vertical bench cylinder → the near
 *     intersection's yaw → `widgetBus {drag-move, yawRad}`. The MOVE HANDLER
 *     allocates NOTHING beyond the ray arithmetic (§7.3): it writes the yaw to a
 *     ref and `invalidate()`s; the loop reads the ref, follows the grabbed panel
 *     along the arc, and preview-shifts the displaced panels toward their
 *     would-be slots (`nearestSlotIndex` → precomputed `solveBenchLayout`, damped
 *     on preallocated scratch, ~400 ms).
 *  3. DROP  (`pointerup` / `pointercancel` / pointer-leaves-canvas =
 *     drop-in-place): `nearestSlotIndex` resolves the final index →
 *     `useWidgetLayout().moveWidget(id, toIndex)` (reorder + persist + notify) →
 *     `widgetBus {drag-drop}`; the rig re-solves and every panel eases to its
 *     final slot; on SETTLE the loop emits `widgetBus {docked}` →
 *     `worldEvents.emit("chime", {kind:"two-note"})` (the ONE dock chime — the
 *     existing name, no amendment). Focus follows for free: `getBenchSlot` now
 *     returns the new slot, so CameraRig's focus→pose path re-glides if the
 *     dragged widget was focused.
 *  4. REDUCED MOTION (§4.4.4, via `worldPrefersReducedMotion()`): no lift/tilt/
 *     preview animation at all — the drag ghost is a FRAME-ONLY outline snapped to
 *     the candidate slot; drop applies the new order as an INSTANT cut (the dock
 *     chime still rings — sound is not gated by reduced motion, Phase-1 rule).
 *  5. CANCEL (`Esc` mid-drag): abort — ease the panel home WITHOUT persisting and
 *     WITHOUT a dock chime. A persistent capture-phase `keydown` listener,
 *     mounted at rig-mount (which is BEFORE `useWorldKeys` in the scene tree, so
 *     it wins the capture race), swallows the Esc so it never also pops focus.
 *
 * ── THE CONTINUITY TRICK (no snap across the drop re-solve) ──────────────────
 * Each rendered panel is wrapped by the rig in an OUTER `<group matrixAutoUpdate=
 * false>`; this hook holds a ref to it and writes `outer.matrix = curWorld ∘
 * slotLocal⁻¹` every animated frame. Because the panel's ACTUAL world transform
 * is always the persistent `curWorld` (position+euler kept in refs across
 * renders) regardless of which slot it was assigned, the drop re-solve (which
 * changes each panel's base slot) never makes anything jump: a `useLayoutEffect`
 * recomputes the inverses and re-applies the outer matrices from the untouched
 * `curWorld` before paint, and the loop then damps `curWorld` → the new base
 * slot (outer matrix shrinking to identity at rest).
 *
 * ── THE RAY→ARC MATH (must match `widgetLayout`'s angle convention exactly) ──
 * `yawRad` is the SIGNED offset from the aisle centerline (see widgetLayout.ts):
 * intersect the pointer ray with the infinite vertical cylinder of radius
 * `BenchConfig.radius` about `center`, take the near (else far) forward
 * intersection, and read the signed angle between the aisle direction and the
 * point's radial — the exact inverse of the solver's `rotateY(aisleDir, α)`, so
 * feeding it to `nearestSlotIndex` resolves the drop with zero convention drift.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { easing } from "maath";
import { bootDone } from "../camera/CameraRig";
import { worldEvents } from "../data/diffing";
import { worldPrefersReducedMotion } from "../prefs/useWorldPrefs";
import { STUDIOLO } from "../materials/tokens";
import {
  DEFAULT_BENCH_CONFIG,
  slotAngles,
  solveBenchLayout,
} from "./widgetLayout";
import { useWidgetLayout } from "./widgetLayoutStore";
import { widgetBus } from "./widgetBus";
import type { DragHandleProps } from "./WorldPanel";
import type { BenchSlot, WidgetId } from "./widgetTypes";

// ── Motion constants (§2.6 — furniture-heavy, never snaps) ───────────────────
const LIFT_Y = 0.06; // the grabbed panel rises ~6 cm — picked up, not teleported
const TILT_RAD = (4 * Math.PI) / 180; // ~4° pitch toward the camera
const FOLLOW_SMOOTH = 0.09; // grabbed panel tracks the pointer briskly
const PREVIEW_SMOOTH = 0.18; // displaced panels slide (~400 ms felt)
const SETTLE_SMOOTH = 0.2; // everything eases to its final slot on drop
const EPS_POS = 1e-4; // settle threshold — below this, snap + sleep

// ── Bench geometry (read once from the frozen §3.4 defaults) ─────────────────
const CENTER = DEFAULT_BENCH_CONFIG.center;
const RADIUS = DEFAULT_BENCH_CONFIG.radius;
const EYE_Y = DEFAULT_BENCH_CONFIG.eyeY;

/**
 * The horizontal aisle direction (x,z) from `center` toward the trunk at the
 * origin — replicated from `widgetLayout`'s private helper so the drag yaw
 * speaks the identical convention (the solver does not export it).
 */
function aisleDir(center: THREE.Vector3Tuple): [number, number] {
  const ax = -center[0];
  const az = -center[2];
  const mag = Math.hypot(ax, az);
  if (mag < 1e-9) return [0, -1];
  return [ax / mag, az / mag];
}
const AISLE = aisleDir(CENTER);

// ── The reduced-motion drag ghost (frame-only outline, §4.4.4) ───────────────
// A single wireframe rectangle the size of a panel body. Module singletons
// (lifetime = the world island): ONE geometry, ONE line material, mounted by the
// rig and positioned/toggled imperatively by this hook — one draw call, and ONLY
// while a reduced-motion drag is in flight.
const GHOST_W = 1.6;
const GHOST_H = 1.1;
function buildGhostGeometry(): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(GHOST_W, GHOST_H, 0.02);
  const edges = new THREE.EdgesGeometry(box);
  box.dispose();
  return edges;
}
export const GHOST_GEOMETRY: THREE.BufferGeometry = buildGhostGeometry();
export const GHOST_MATERIAL: THREE.LineBasicMaterial = new THREE.LineBasicMaterial({
  color: new THREE.Color(STUDIOLO.candleflame),
  transparent: true,
  opacity: 0.85,
});

// ── Module-level scratch — the ONLY objects the loop/handlers touch ──────────
const _mat = new THREE.Matrix4();
const _matSlot = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleOne = new THREE.Vector3(1, 1, 1);
const _slotPos = new THREE.Vector3();
const _slotEul = new THREE.Euler();
const _tgtPos = new THREE.Vector3();
const _tgtEul = new THREE.Euler();

type DragPhase = "idle" | "dragging" | "settling";

export interface WidgetDragApi {
  /** Per-widget pointer handlers for the frame grip (spread onto `<WorldPanel dragHandleProps>`). Stable identity per id. */
  dragHandlePropsFor(id: WidgetId): DragHandleProps;
  /** Ref callback for the per-panel OUTER animation group the rig wraps each widget in. Stable identity per id. */
  panelGroupRef(id: WidgetId): (obj: THREE.Object3D | null) => void;
  /** Ref callback for the reduced-motion ghost `<lineSegments>` the rig mounts once. */
  registerGhost(obj: THREE.Object3D | null): void;
  /** The widget currently being dragged (drives the rig's `focused`/lift bloom). null at rest. */
  draggingId: WidgetId | null;
}

/**
 * The drag lifecycle. `slots` is the current solved bench (leftmost→rightmost)
 * and `order` its widget ids — both handed down from `WidgetRig` so this hook and
 * the rig share one solve. Everything hot lives in refs; React state changes only
 * at interaction cadence (grab / release), never per pointer-move or per frame.
 */
export function useWidgetDrag(
  slots: BenchSlot[],
  order: WidgetId[],
): WidgetDragApi {
  const invalidate = useThree((s) => s.invalidate);
  const { moveWidget } = useWidgetLayout();

  // Latest render snapshot for the loop / handlers (read via refs, never stale).
  const slotsRef = useRef<BenchSlot[]>(slots);
  const orderRef = useRef<WidgetId[]>(order);
  slotsRef.current = slots;
  orderRef.current = order;

  // Persistent per-widget animation state (keyed by id, survives re-renders).
  const curPos = useRef(new Map<WidgetId, THREE.Vector3>());
  const curEul = useRef(new Map<WidgetId, THREE.Euler>());
  const slotInv = useRef(new Map<WidgetId, THREE.Matrix4>());
  const groups = useRef(new Map<WidgetId, THREE.Object3D>());

  // Drag control (all refs — mutated in handlers/loop with zero re-renders).
  const phaseRef = useRef<DragPhase>("idle");
  const draggingIdRef = useRef<WidgetId | null>(null);
  const fromIndexRef = useRef(0);
  const yawRef = useRef(0);
  const anglesRef = useRef<number[]>([]); // slotAngles for the frozen drag order
  const previewsRef = useRef<BenchSlot[][]>([]); // solved layout per candidate index
  const reducedRef = useRef(false);
  const pendingDockRef = useRef(false);
  const dockIdRef = useRef<WidgetId | null>(null);
  const ghostRef = useRef<THREE.Object3D | null>(null);
  const lastGhostIndexRef = useRef(-1);

  // Only re-render trigger: which panel is grabbed (rig blooms/​lifts it).
  const [draggingId, setDraggingId] = useState<WidgetId | null>(null);

  // ── outer.matrix = curWorld ∘ slotLocal⁻¹ (the continuity trick) ──────────
  const applyOuter = useCallback((id: WidgetId): void => {
    const g = groups.current.get(id);
    const cp = curPos.current.get(id);
    const ce = curEul.current.get(id);
    const inv = slotInv.current.get(id);
    if (g === undefined || cp === undefined || ce === undefined || inv === undefined) {
      return;
    }
    _quat.setFromEuler(ce);
    _mat.compose(cp, _quat, _scaleOne); // M_cur
    _mat.multiply(inv); // M_cur * slotLocal⁻¹
    g.matrix.copy(_mat);
    g.matrixWorldNeedsUpdate = true;
  }, []);

  // ── nearest slot index for a yaw (scans the frozen drag-order angles) ─────
  // Mirrors `nearestSlotIndex` (ties → lower index) but allocation-free: the
  // angle table is cached at grab time because `order` is frozen during a drag.
  const nearestIndex = useCallback((yaw: number): number => {
    const a = anglesRef.current;
    if (a.length === 0) return 0;
    let best = 0;
    let bestDist = Math.abs(a[0]! - yaw);
    for (let i = 1; i < a.length; i++) {
      const d = Math.abs(a[i]! - yaw);
      if (d < bestDist) {
        bestDist = d;
        best = i;
      }
    }
    return best;
  }, []);

  // ── ray ∩ vertical bench cylinder → signed aisle-offset yaw ───────────────
  const yawFromRay = useCallback((ray: THREE.Ray): number => {
    const ox = ray.origin.x;
    const oz = ray.origin.z;
    const dx = ray.direction.x;
    const dz = ray.direction.z;
    const a = dx * dx + dz * dz;
    if (a < 1e-9) return NaN; // ray points straight up/down → no arc yaw
    const ex = ox - CENTER[0];
    const ez = oz - CENTER[2];
    const b = 2 * (ex * dx + ez * dz);
    const c = ex * ex + ez * ez - RADIUS * RADIUS;
    const disc = b * b - 4 * a * c;
    if (disc < 0) return NaN; // ray misses the cylinder → keep the last yaw
    const s = Math.sqrt(disc);
    let t = (-b - s) / (2 * a);
    if (t < 0) t = (-b + s) / (2 * a);
    if (t < 0) return NaN; // cylinder is behind the camera
    let vx = ox + t * dx - CENTER[0];
    let vz = oz + t * dz - CENTER[2];
    const m = Math.hypot(vx, vz);
    if (m < 1e-9) return NaN;
    vx /= m;
    vz /= m;
    // Inverse of widgetLayout's rotateY(aisleDir, α): α = atan2(sinα, cosα).
    return Math.atan2(AISLE[1] * vx - AISLE[0] * vz, AISLE[0] * vx + AISLE[1] * vz);
  }, []);

  // ── arc pose for a yaw → fills _tgtPos (at eye height), returns face-Y ─────
  const arcPose = useCallback((yaw: number): number => {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const dx = AISLE[0] * cos + AISLE[1] * sin;
    const dz = -AISLE[0] * sin + AISLE[1] * cos;
    _tgtPos.set(CENTER[0] + RADIUS * dx, EYE_Y, CENTER[2] + RADIUS * dz);
    return Math.atan2(-dx, -dz); // panel faces the arc center
  }, []);

  const positionGhost = useCallback((index: number): void => {
    const g = ghostRef.current;
    const slot = slotsRef.current[index];
    if (g === null || slot === undefined) return;
    g.position.set(slot.position[0], slot.position[1], slot.position[2]);
    g.rotation.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
  }, []);

  const showGhost = useCallback((visible: boolean): void => {
    if (ghostRef.current !== null) ghostRef.current.visible = visible;
  }, []);

  // ── seed / re-sync animation state whenever the solved bench changes ──────
  // Runs synchronously before paint. Seeds new panels at their base slot,
  // recomputes each slot's inverse, and re-applies every outer matrix from the
  // UNTOUCHED `curWorld` refs (continuity across the drop re-solve). When idle it
  // also snaps `curWorld` to the (possibly new) base slot so an external reorder
  // never leaves a panel stranded; mid-settle it leaves `curWorld` alone so the
  // easing stays continuous.
  useLayoutEffect(() => {
    const alive = new Set<WidgetId>();
    for (const slot of slots) alive.add(slot.widgetId);
    for (const id of Array.from(curPos.current.keys())) {
      if (!alive.has(id)) {
        curPos.current.delete(id);
        curEul.current.delete(id);
        slotInv.current.delete(id);
      }
    }
    const settling = phaseRef.current !== "idle";
    for (const slot of slots) {
      const id = slot.widgetId;
      let cp = curPos.current.get(id);
      if (cp === undefined) {
        cp = new THREE.Vector3(slot.position[0], slot.position[1], slot.position[2]);
        curPos.current.set(id, cp);
      } else if (!settling) {
        cp.set(slot.position[0], slot.position[1], slot.position[2]);
      }
      let ce = curEul.current.get(id);
      if (ce === undefined) {
        ce = new THREE.Euler(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
        curEul.current.set(id, ce);
      } else if (!settling) {
        ce.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
      }
      let inv = slotInv.current.get(id);
      if (inv === undefined) {
        inv = new THREE.Matrix4();
        slotInv.current.set(id, inv);
      }
      _slotEul.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
      _quat.setFromEuler(_slotEul);
      _slotPos.set(slot.position[0], slot.position[1], slot.position[2]);
      _matSlot.compose(_slotPos, _quat, _scaleOne);
      inv.copy(_matSlot).invert();
      applyOuter(id);
    }
  }, [slots, applyOuter]);

  // ── preview slot lookup (no per-frame closure alloc) ─────────────────────
  function previewSlotFor(preview: BenchSlot[], id: WidgetId): BenchSlot | null {
    for (let i = 0; i < preview.length; i++) {
      if (preview[i]!.widgetId === id) return preview[i]!;
    }
    return null;
  }

  // ── the ONE new useFrame — self-invalidating, early-exit on settle ────────
  useFrame((_, delta) => {
    const phase = phaseRef.current;
    if (phase === "idle") return; // sleeping: costs one comparison on foreign frames
    const dt = Math.min(delta, 0.1); // a background-tab return can't teleport
    const list = slotsRef.current;
    const dragId = draggingIdRef.current;

    if (phase === "dragging") {
      const to = nearestIndex(yawRef.current);
      const preview = previewsRef.current[to] ?? list;
      for (let i = 0; i < list.length; i++) {
        const id = list[i]!.widgetId;
        const cp = curPos.current.get(id);
        const ce = curEul.current.get(id);
        if (cp === undefined || ce === undefined) continue;
        if (id === dragId) {
          const faceY = arcPose(yawRef.current);
          _tgtPos.y += LIFT_Y; // ride ~6 cm above the arc while carried
          easing.damp3(cp, _tgtPos, FOLLOW_SMOOTH, dt);
          _tgtEul.set(TILT_RAD, faceY, 0); // ~4° tilt toward the camera
          easing.dampE(ce, _tgtEul, FOLLOW_SMOOTH, dt);
        } else {
          const ps = previewSlotFor(preview, id) ?? list[i]!;
          easing.damp3(cp, ps.position, PREVIEW_SMOOTH, dt);
          easing.dampE(ce, ps.rotation, PREVIEW_SMOOTH, dt);
        }
        applyOuter(id);
      }
      invalidate(); // stay awake for the whole active drag (§7.3)
      return;
    }

    // phase === "settling": ease every panel to its final base slot.
    let moving = false;
    for (let i = 0; i < list.length; i++) {
      const slot = list[i]!;
      const cp = curPos.current.get(slot.widgetId);
      const ce = curEul.current.get(slot.widgetId);
      if (cp === undefined || ce === undefined) continue;
      const m1 = easing.damp3(cp, slot.position, SETTLE_SMOOTH, dt);
      const m2 = easing.dampE(ce, slot.rotation, SETTLE_SMOOTH, dt);
      if (m1 || m2) moving = true;
      applyOuter(slot.widgetId);
    }
    if (moving) {
      invalidate();
      return;
    }
    // Settled — snap exact, sleep, and dock (if this settle followed a drop).
    for (let i = 0; i < list.length; i++) {
      const slot = list[i]!;
      const cp = curPos.current.get(slot.widgetId);
      const ce = curEul.current.get(slot.widgetId);
      if (cp !== undefined) cp.set(slot.position[0], slot.position[1], slot.position[2]);
      if (ce !== undefined) ce.set(slot.rotation[0], slot.rotation[1], slot.rotation[2]);
      applyOuter(slot.widgetId);
    }
    phaseRef.current = "idle";
    if (pendingDockRef.current) {
      pendingDockRef.current = false;
      const id = dockIdRef.current;
      dockIdRef.current = null;
      if (id !== null) widgetBus.emit({ kind: "docked", widgetId: id });
      worldEvents.emit("chime", { kind: "two-note" }); // the one dock chime
    }
    invalidate(); // final paint at the settled transform, then the world sleeps
  });

  // ── DROP / CANCEL resolution (shared by pointerup, pointercancel, Esc) ────
  const finishDrag = useCallback(
    (id: WidgetId, commit: boolean): void => {
      const to = nearestIndex(yawRef.current);
      const from = fromIndexRef.current;
      draggingIdRef.current = null;

      if (reducedRef.current) {
        // Reduced motion: instant cut. No easing; the ghost simply vanishes.
        showGhost(false);
        lastGhostIndexRef.current = -1;
        reducedRef.current = false;
        phaseRef.current = "idle";
        setDraggingId(null);
        if (commit && to !== from) {
          widgetBus.emit({ kind: "drag-drop", widgetId: id, toIndex: to });
          moveWidget(id, to); // layout effect snaps panels to the new order
        }
        if (commit) {
          widgetBus.emit({ kind: "docked", widgetId: id });
          worldEvents.emit("chime", { kind: "two-note" }); // sound is not motion
        }
        invalidate();
        return;
      }

      // Full motion: hand the bench to the settle phase of the loop.
      setDraggingId(null); // frame bloom drops the instant the panel is released
      if (commit) {
        widgetBus.emit({ kind: "drag-drop", widgetId: id, toIndex: to });
        pendingDockRef.current = true;
        dockIdRef.current = id;
        phaseRef.current = "settling";
        moveWidget(id, to); // reorder + persist + notify → re-solve → layout effect
      } else {
        // Esc cancel: ease home, no persist, no dock (order is untouched).
        pendingDockRef.current = false;
        dockIdRef.current = null;
        phaseRef.current = "settling";
      }
      invalidate();
    },
    [moveWidget, invalidate, nearestIndex, showGhost],
  );

  // Route the persistent Esc listener through a ref so the listener effect can
  // mount exactly once (see the capture-race note below) without going stale.
  const finishRef = useRef(finishDrag);
  finishRef.current = finishDrag;

  // ── Esc-to-cancel (§4.4.5) ────────────────────────────────────────────────
  // Mounted once, capture phase, on window. WidgetRig sits BEFORE CameraRig in
  // the scene tree, so this listener registers before `useWorldKeys` and wins the
  // capture race: while dragging it swallows Esc (stopImmediatePropagation) so the
  // drag aborts WITHOUT also popping focus. When not dragging it is inert and lets
  // Esc propagate to the normal focus-pop handler.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key !== "Escape") return;
      const id = draggingIdRef.current;
      if (id === null) return; // not dragging → let useWorldKeys handle Esc
      e.preventDefault();
      e.stopImmediatePropagation();
      finishRef.current(id, false);
    }
    window.addEventListener("keydown", onKey, { capture: true });
    return () => window.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  // ── per-id pointer handler bundles (built once, stable identity) ──────────
  const handlerCache = useRef(new Map<WidgetId, DragHandleProps>());
  const groupCbCache = useRef(new Map<WidgetId, (obj: THREE.Object3D | null) => void>());

  const dragHandlePropsFor = useCallback(
    (id: WidgetId): DragHandleProps => {
      const cached = handlerCache.current.get(id);
      if (cached !== undefined) return cached;

      const onPointerDown = (e: ThreeEvent<PointerEvent>): void => {
        if (!bootDone()) return; // inert until the Litany finishes
        if (phaseRef.current !== "idle") return; // a drag is already live
        const currentOrder = orderRef.current;
        const from = currentOrder.indexOf(id);
        if (from === -1) return;
        e.stopPropagation();
        try {
          (e.target as unknown as {
            setPointerCapture(pointerId: number): void;
          }).setPointerCapture(e.pointerId);
        } catch {
          // capture is best-effort; pointerup still fires on the canvas
        }

        draggingIdRef.current = id;
        fromIndexRef.current = from;
        reducedRef.current = worldPrefersReducedMotion();
        const angles = slotAngles(currentOrder); // one alloc at grab time
        anglesRef.current = angles;
        yawRef.current = angles[from] ?? 0;
        lastGhostIndexRef.current = from;

        if (reducedRef.current) {
          positionGhost(from);
          showGhost(true);
        } else {
          // Precompute the solved layout for every candidate index so the move
          // handler and the loop never solve per event (§7.3).
          const previews: BenchSlot[][] = [];
          const n = currentOrder.length;
          for (let toIndex = 0; toIndex < n; toIndex++) {
            const po = currentOrder.slice();
            const f = po.indexOf(id);
            po.splice(f, 1);
            po.splice(toIndex, 0, id);
            previews[toIndex] = solveBenchLayout(po);
          }
          previewsRef.current = previews;
          phaseRef.current = "dragging";
        }
        setDraggingId(id);
        widgetBus.emit({ kind: "drag-start", widgetId: id });
        invalidate();
      };

      const onPointerMove = (e: ThreeEvent<PointerEvent>): void => {
        if (draggingIdRef.current !== id) return;
        const yaw = yawFromRay(e.ray);
        if (Number.isFinite(yaw)) yawRef.current = yaw;
        widgetBus.emit({ kind: "drag-move", widgetId: id, yawRad: yawRef.current });
        if (reducedRef.current) {
          const to = nearestIndex(yawRef.current);
          if (to !== lastGhostIndexRef.current) {
            lastGhostIndexRef.current = to;
            positionGhost(to);
          }
        }
        invalidate();
      };

      const onPointerUp = (e: ThreeEvent<PointerEvent>): void => {
        if (draggingIdRef.current !== id) return;
        try {
          (e.target as unknown as {
            releasePointerCapture(pointerId: number): void;
          }).releasePointerCapture(e.pointerId);
        } catch {
          // best-effort release
        }
        finishDrag(id, true);
      };

      const onPointerCancel = (e: ThreeEvent<PointerEvent>): void => {
        if (draggingIdRef.current !== id) return;
        // Pointer left the canvas / gesture interrupted = drop-in-place (commit).
        finishDrag(id, true);
      };

      const bundle: DragHandleProps = {
        onPointerDown,
        onPointerMove,
        onPointerUp,
        onPointerCancel,
      };
      handlerCache.current.set(id, bundle);
      return bundle;
    },
    [
      invalidate,
      finishDrag,
      nearestIndex,
      positionGhost,
      showGhost,
      yawFromRay,
    ],
  );

  const panelGroupRef = useCallback((id: WidgetId) => {
    const cached = groupCbCache.current.get(id);
    if (cached !== undefined) return cached;
    const cb = (obj: THREE.Object3D | null): void => {
      if (obj !== null) {
        obj.matrixAutoUpdate = false; // the loop owns this group's transform
        groups.current.set(id, obj);
        applyOuter(id); // no-op identity until curWorld is seeded
      } else {
        groups.current.delete(id);
      }
    };
    groupCbCache.current.set(id, cb);
    return cb;
  }, [applyOuter]);

  const registerGhost = useCallback((obj: THREE.Object3D | null): void => {
    ghostRef.current = obj;
    if (obj !== null) obj.visible = false;
  }, []);

  return { dragHandlePropsFor, panelGroupRef, registerGhost, draggingId };
}
