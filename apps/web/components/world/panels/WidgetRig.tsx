"use client";

/**
 * WidgetRig.tsx — W-06 · The Studiolo · The Bottega (Phase 3) · widget-rig-and-nav
 *
 * The rig that stands the panels on the bench and makes them navigable. It reads
 * the persisted arc `order` (`useWidgetLayout`) + the focus chain (`useFocusStack`),
 * solves the bench geometry once per reorder (`solveBenchLayout`, memoized on the
 * `order` array identity), and renders each REGISTERED widget's self-contained
 * component with `{ slot, focused, lod }` (PHASE-3-PLAN §W-06, §4.3, §7.2).
 *
 * ── THE LOD LAW (§7.2) ──────────────────────────────────────────────────────
 * At most three panels render FULL content — the focused panel plus its two arc
 * neighbours (index ±1 in the solved, leftmost→rightmost layout). Every other
 * bench panel is a PLACARD (frame + one SDF title). At the vestibule (nothing
 * focused) the FULL trio is centred on the arc middle (`floor(n/2)` ± 1). LOD is
 * chosen at render from the focus/order state — a mount/prop change at
 * interaction cadence, NEVER per frame. This file has NO `useFrame`: the glide
 * belongs to `cameraBus`; panels at rest are static world objects (§7.3).
 *
 * ── THE POSE GETTER (mirrors how lantern poses resolve) ─────────────────────
 * `CameraRig.poseForFocus` must resolve a widget-focus level to a bench reading
 * pose WITHOUT importing React state (it is a pure module function, called from
 * an effect). Lantern poses resolve from the tree layout the rig already holds;
 * the bench has no equivalent world-layout singleton, so this rig keeps the
 * current solved slots in a MODULE ref, synced from an effect, and exposes
 * `getBenchSlot(widgetId)` over it. CameraRig imports that getter and reads
 * `getBenchSlot(id)?.cameraPose ?? VESTIBULE_POSE`. The `swipeBench(dir)` helper
 * (used by both the `←/→` keys in `useWorldKeys` and the wheel listener below)
 * resolves prev/next off the same synced `order`.
 *
 * ── SWIPE INPUTS (§4.3) ─────────────────────────────────────────────────────
 * `←/→` live in the single `useWorldKeys` listener (they call `swipeBench`). The
 * wheel/trackpad swipe is a local capture-phase `wheel` listener mounted here (a
 * two-finger horizontal swipe on macOS IS a wheel event — no gesture lib). It is
 * horizontal-DOMINANT only (`|deltaX| > |deltaY|`), accumulated past ~60 px, then
 * debounced ~350 ms into ONE discrete swipe; vertical wheel is left entirely
 * untouched (CameraControls dolly in open space, uikit scroll over a panel). The
 * accumulator is listener-side arithmetic that allocates nothing per event and
 * demands no frame until the threshold trips (§7.3) — the discrete swipe then
 * pushes focus and CameraRig's existing effect owns the invalidate + glide.
 */

import { useEffect, useMemo, type JSX } from "react";
import { useThree } from "@react-three/fiber";
import { focusStack, useFocusStack } from "../camera/useFocusStack";
import { bootDone } from "../camera/CameraRig";
import {
  lodCenterIndex,
  lodForSlot,
  neighborOf,
  solveBenchLayout,
} from "./widgetLayout";
import { getWidgetSpec } from "./widgetRegistry";
import { useWidgetLayout } from "./widgetLayoutStore";
import {
  GHOST_GEOMETRY,
  GHOST_MATERIAL,
  useWidgetDrag,
} from "./useWidgetDrag";
import type { BenchSlot, WidgetId } from "./widgetTypes";

// ── Module-synced bench state (the no-React-state seam for CameraRig / keys) ──
// Kept in sync with the CURRENT solved layout via `WidgetRig`'s effect below.
// `getBenchSlot` mirrors how `lanternFocusPose` resolves a pose from layout
// without any hook; `swipeBench` reads the same order for prev/next navigation.
let _benchSlots: BenchSlot[] = [];
let _benchOrder: WidgetId[] = [];

/**
 * The solved slot for `widgetId` under the CURRENT bench layout, or `null` if it
 * isn't on the bench (hidden / rig unmounted). CameraRig reads
 * `getBenchSlot(id)?.cameraPose ?? VESTIBULE_POSE` — no React import, no hook.
 */
export function getBenchSlot(widgetId: WidgetId): BenchSlot | null {
  for (let i = 0; i < _benchSlots.length; i++) {
    const s = _benchSlots[i]!;
    if (s.widgetId === widgetId) return s;
  }
  return null;
}

/**
 * Push focus to the prev (`dir === -1`) / next (`dir === +1`) bench panel — the
 * shared body of the `←/→` keys AND the wheel swipe. `neighborOf` handles every
 * edge: at the vestibule it focuses the nearest panel on that side; past the
 * arc's end it returns `null` (the §4.3 soft no-op → nothing pushed). Called at
 * interaction cadence only (key press / threshold trip).
 */
export function swipeBench(dir: 1 | -1): void {
  if (_benchOrder.length === 0) return;
  const cur = focusStack.current();
  const currentId = cur.kind === "widget" ? cur.widgetId : null;
  const next = neighborOf(_benchOrder, currentId, dir);
  if (next !== null) focusStack.push({ kind: "widget", widgetId: next });
}

// ── Wheel-swipe (§4.3) ───────────────────────────────────────────────────────
const SWIPE_THRESHOLD_PX = 60; // horizontal travel that counts as one swipe
const SWIPE_DEBOUNCE_MS = 350; // cooldown so one gesture = one discrete swipe

/** True when `target` is a text-entry element (typing guard, §3.1 verbatim). */
function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return (
    el !== null &&
    (el.tagName === "INPUT" ||
      el.tagName === "TEXTAREA" ||
      el.tagName === "SELECT" ||
      el.isContentEditable)
  );
}

/**
 * Capture-phase `wheel` listener on the canvas. Horizontal-dominant gestures
 * accumulate into `accX` (pure arithmetic, zero allocation, no `invalidate`);
 * once past the threshold and clear of the debounce it fires ONE `swipeBench`.
 * Vertical-dominant events return immediately — the dolly/scroll paths are never
 * touched. Boot-gated + typing-guarded like every other world input.
 */
function useWheelSwipe(): void {
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const el = gl.domElement;
    let accX = 0;
    let lastSwipeAt = 0;

    function onWheel(e: WheelEvent): void {
      if (!bootDone()) return; // ignore navigation until the Litany finishes
      if (isTypingTarget(e.target)) return; // ribbon input focused → stand down

      // Vertical-dominant → not our gesture: leave CameraControls dolly / uikit
      // scroll entirely alone (do not accumulate, do not consume).
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;

      const now = e.timeStamp;
      if (now - lastSwipeAt < SWIPE_DEBOUNCE_MS) return; // cooldown: one per gesture

      accX += e.deltaX;
      if (Math.abs(accX) < SWIPE_THRESHOLD_PX) return; // still arithmetic — no frame

      const dir: 1 | -1 = accX > 0 ? 1 : -1;
      accX = 0;
      lastSwipeAt = now;
      swipeBench(dir); // focus push → CameraRig owns the invalidate + glide
    }

    // Passive: we never preventDefault — vertical wheel must keep dollying/scrolling.
    el.addEventListener("wheel", onWheel, { capture: true, passive: true });
    return () => {
      el.removeEventListener("wheel", onWheel, { capture: true });
    };
  }, [gl]);
}

/**
 * The bench: mounts every REGISTERED widget on its solved slot with the right
 * LOD, keeps the module bench state synced for the pose getter + navigation, and
 * owns the wheel-swipe listener. Renders inside the R3F canvas (a fragment of
 * world-anchored panel groups); the registry is empty until the Conductor
 * populates it at the W2 boundary, so this renders no panels until then.
 */
export function WidgetRig(): JSX.Element {
  const { layout } = useWidgetLayout();
  const { current } = useFocusStack();

  // The wheel/trackpad swipe listener (§4.3) — mounted here, on the canvas.
  useWheelSwipe();

  // Solve once per reorder — memoized on the `order` array identity (the store
  // hands a NEW array only on a real move, so this is stable at rest).
  const slots = useMemo(() => solveBenchLayout(layout.order), [layout.order]);

  // Publish the solved layout to the module seam so CameraRig's pose getter and
  // `swipeBench` see the current bench without importing React state.
  useEffect(() => {
    _benchSlots = slots;
    _benchOrder = layout.order;
    return () => {
      _benchSlots = [];
      _benchOrder = [];
    };
  }, [slots, layout.order]);

  const focusedWidgetId = current.kind === "widget" ? current.widgetId : null;

  // ── W-07 grab-and-move (§4.4) ────────────────────────────────────────────
  // The drag lifecycle hook — the phase's ONE new `useFrame` lives inside it,
  // self-invalidating while a drag/settle is in flight and early-exiting to
  // idle-zero at rest (§7.3). It hands back a per-widget `dragHandleProps` bag
  // (spread onto each panel's frame grip), a per-widget ref callback for the
  // OUTER animation group we wrap each panel in (the hook writes that group's
  // matrix so the panel body/frame stay a frozen `<WorldPanel>` — the panel is
  // never re-rendered per frame), the id currently being carried, and the ref
  // for the reduced-motion drag ghost.
  const drag = useWidgetDrag(slots, layout.order);

  // LOD centre (§7.2): the focused slot, or the arc middle at the vestibule.
  // `lodCenterIndex`/`lodForSlot` are the pure §7.2 selector (widgetLayout.ts) —
  // the ≤3-full draw-call invariant they enforce is pinned by benchPerf.test.ts.
  const n = slots.length;
  const focusIndex = focusedWidgetId
    ? slots.findIndex((s) => s.widgetId === focusedWidgetId)
    : -1;
  const center = lodCenterIndex(n, focusIndex);

  return (
    <>
      {slots.map((slot) => {
        const spec = getWidgetSpec(slot.widgetId);
        if (spec === undefined) return null; // not landed on the bench yet (W2)
        const WidgetComponent = spec.component;
        // The carried panel reads focused so its brass frame blooms and stands
        // out while its siblings recede — the sanctioned way to signal
        // "picked up" through `<WorldPanel>`'s frozen 2-material seam (no rim
        // dim prop exists to touch). Interaction cadence only (grab / release).
        const focused =
          slot.widgetId === focusedWidgetId || slot.widgetId === drag.draggingId;
        const lod = lodForSlot(slot.index, center);
        return (
          // OUTER animation group: `matrixAutoUpdate={false}`, identity at rest
          // (so the inner `<WorldPanel>` group positions the panel by its slot,
          // static — the primitive's contract). During a drag the hook writes
          // this group's matrix each frame; panel-content pointer events cannot
          // complete a click because the gesture is pointer-captured on the
          // frame grip (uikit never sees a matching pointerdown on a row).
          <group
            key={slot.widgetId}
            ref={drag.panelGroupRef(slot.widgetId)}
            matrixAutoUpdate={false}
          >
            <WidgetComponent
              slot={slot}
              focused={focused}
              lod={lod}
              dragHandleProps={drag.dragHandlePropsFor(slot.widgetId)}
            />
          </group>
        );
      })}
      {/* The reduced-motion drag ghost (§4.4.4): a frame-only outline the hook
          snaps to the candidate slot and toggles imperatively. One draw call,
          and only visible while a reduced-motion drag is in flight. */}
      <lineSegments
        ref={drag.registerGhost}
        geometry={GHOST_GEOMETRY}
        material={GHOST_MATERIAL}
        frustumCulled={false}
      />
    </>
  );
}

export default WidgetRig;
