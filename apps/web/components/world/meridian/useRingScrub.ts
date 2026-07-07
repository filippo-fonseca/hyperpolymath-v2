"use client";

/**
 * useRingScrub.ts — M-10 · The Studiolo · Phase 2 (The Meridian Ring)
 *
 * The hand on the wheel — Hero Moment V in miniature. This unit IMPLEMENTS and
 * REGISTERS the pre-frozen §2.3 `MeridianBus` (the shape was frozen at Wave M1
 * in `meridianBus.ts`; the real offset/velocity state lives HERE). While the
 * ring is framed (`focus.kind === "ring"` with no `eventId`), a capture-phase
 * `wheel` listener on the canvas turns two-finger swipes into scrub velocity;
 * heavy brass momentum decelerates it toward a 30-minute detent; `snapToNow`
 * springs the dial back to *now* for the Esc-leave sequence.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY MODULE REFS, NOT REACT STATE (PLAN §4.3): the scrub offset/velocity are
 * read EVERY demanded frame by M-05's dial rotation and M-06's window roll via
 * `meridianBus.getScrubOffsetMs()`. React state would re-render the tree at
 * frame cadence — forbidden. All animation state is module-scope `let`s mutated
 * in `useFrame`; consumers read through the bus getter.
 *
 * THE §4.1 DEMAND RULE (implemented here, verbatim): frames are demanded ONLY
 * while there is live scrub work — `|velocity| > 0` (momentum), a detent settle,
 * a snap-to-now spring, or a rubber-band recovery at the slab edge. The frame
 * loop is SELF-INVALIDATING with an EARLY EXIT: each active frame calls
 * `invalidate()` to demand the next; the moment the animation settles the loop
 * returns without invalidating, so the world falls straight back to the idle
 * 1-frame-per-minute regime. A `wheel` event (or `snapToNow`) kicks the loop
 * awake with a single `invalidate()`.
 *
 * MOMENTUM MODEL (§5.4 — HEAVY brass, low overshoot):
 *   • velocity decays by a PURE exponential with a ~350 ms half-life (heavy
 *     brass friction — a bronze wheel on a good bearing, not an iPhone list).
 *   • as it slows past `DETENT_ENGAGE_VEL` the settle is handed to a
 *     critically-damped `easing.damp` spring toward the nearest 30-minute mark
 *     (the soft detent), which never overshoots — "catch the Ring at next
 *     Friday" lands legibly on the half-hour.
 *   • `snapToNow` is the same critically-damped `easing.damp` spring, target 0,
 *     ~700 ms felt — the decelerating return the Esc path awaits (CameraRig
 *     sequences snap → glide-home).
 *   • the offset is clamped to the loaded slab `[windowStartMs, windowEndMs]`
 *     with an exponential rubber-band past the edge (the "there's more time out
 *     there" affordance reserved for the stretch month-zoetrope, M-15).
 *
 * REDUCED MOTION (§honesty, `worldPrefersReducedMotion`): NO momentum. The wheel
 * steps the dial in discrete 1-hour increments (accumulating pixels so a single
 * swipe is not dozens of hops), and `snapToNow` is instant. One frame demanded
 * per step; the loop never runs.
 *
 * CAMERA COORDINATION: on ring-focus enter/leave the hook calls CameraRig's
 * `setRingScrubActive(b)` seam, which suspends CameraControls' wheel/dolly (so a
 * two-finger swipe scrubs time instead of dollying) and relaxes the up-look
 * polar limit — restoring both on leave. All camera flight still flows through
 * `cameraBus`; this hook never moves the camera.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { easing } from "maath";
import { focusStack } from "../camera/useFocusStack";
import { setRingScrubActive } from "../camera/CameraRig";
import { useWorldData } from "../data/useWorldData";
import { worldPrefersReducedMotion } from "../prefs/useWorldPrefs";
import { __registerMeridianBusImpl, type MeridianBus } from "./meridianBus";

// ── Tuning constants (§5.4) ──────────────────────────────────────────────────
const MS_PER_MIN = 60_000;
/** Wheel gain: 45 minutes of dial per 100 px of swipe, at unit velocity. */
const MS_DIAL_PER_PX = (45 * MS_PER_MIN) / 100;
/** HEAVY brass friction: velocity half-life. Higher = lighter; 350 ms is heavy. */
const FRICTION_HALFLIFE_S = 0.35;
/** Exponential time-constant τ = t½ / ln2. Impulse displacement ≈ Δv · τ. */
const FRICTION_TAU_S = FRICTION_HALFLIFE_S / Math.LN2;
/** Below this |velocity| (ms of dial per real second) the detent takes over. */
const DETENT_ENGAGE_VEL = 1_800_000;
/** The dial catches on the nearest half-hour. */
const DETENT_MS = 30 * MS_PER_MIN;
/** Detent settle spring: heavy, low-overshoot (easing.damp never overshoots). */
const DETENT_SMOOTH = 0.22;
/** snapToNow spring smoothTime → ~700 ms felt return (arrival ≈ 2× smoothTime). */
const SNAP_SMOOTH = 0.35;
/** Rubber-band pull-back half-life at the slab edge (stiff). */
const RUBBER_HALFLIFE_S = 0.12;
/** Momentum is bled hard the instant it hits the wall. */
const EDGE_BLEED_HALFLIFE_S = 0.08;
/** Hardest the dial may push past the slab edge before the band caps it. */
const RUBBER_MAX_MS = 2 * 60 * MS_PER_MIN; // 2 h of overshoot
/** Reduced-motion discrete step size + pixels of swipe per step. */
const STEP_MS = 60 * MS_PER_MIN; // 1 hour
const STEP_PX = 40;
/** Clamp the frame delta so a backgrounded-tab catch-up never teleports. */
const MAX_FRAME_DT = 0.05;
/** Below this |offset| a snap is already "home". */
const OFFSET_EPS_MS = 500;

// ── Module-scope animation state (NO React state — read every frame) ─────────
type ScrubPhase = "idle" | "momentum" | "detent" | "snap";

// `easing.damp` stashes a hidden per-prop velocity on `__damp`; keeping the
// offset on a persistent object lets the snap/detent springs carry continuity
// across frames. The index signature keeps that hidden field type-legal.
const scrubOffset: { value: number } & Record<string, unknown> = { value: 0 };

let velocity = 0; // ms of dial per real second (momentum)
let phase: ScrubPhase = "idle";
let detentTarget = 0;
let windowStartMs = Number.NEGATIVE_INFINITY;
let windowEndMs = Number.POSITIVE_INFINITY;
let stepAccumPx = 0; // reduced-motion discrete-step pixel accumulator

const listeners = new Set<(offsetMs: number) => void>();
const snapResolvers: Array<() => void> = [];

const NOOP = (): void => {};
let kickInvalidate: () => void = NOOP;

// ── Small pure helpers ──────────────────────────────────────────────────────
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/** Offset bounds so that `now + offset ∈ [windowStartMs, windowEndMs]`. */
function offsetBounds(): { lo: number; hi: number } {
  const now = Date.now();
  return { lo: windowStartMs - now, hi: windowEndMs - now };
}

/** The scrub offset that lands the dial center (`now + offset`) on the nearest
 *  half-hour mark — the detent target. */
function nearestDetentOffset(offset: number): number {
  const now = Date.now();
  const dial = now + offset;
  return Math.round(dial / DETENT_MS) * DETENT_MS - now;
}

function notify(): void {
  for (const fn of listeners) fn(scrubOffset.value);
}

function resolveSnaps(): void {
  if (snapResolvers.length === 0) return;
  const pending = snapResolvers.splice(0, snapResolvers.length);
  for (const resolve of pending) resolve();
}

/** Reset `easing.damp`'s hidden velocity for `scrubOffset.value`, so a fresh
 *  snap/detent spring starts from REST (deferential, low-overshoot). */
function armOffsetSpring(): void {
  const d = scrubOffset.__damp as Record<string, number> | undefined;
  if (d !== undefined) d.velocity_value = 0;
}

function isScrubActive(): boolean {
  const f = focusStack.current();
  return f.kind === "ring" && f.eventId === undefined;
}

// ── The MeridianBus implementation (registered by the hook on mount) ─────────
const impl: MeridianBus = {
  getScrubOffsetMs(): number {
    return scrubOffset.value;
  },

  addScrubVelocity(msPerSec: number): void {
    // Reduced motion has no momentum — discrete stepping is handled in the wheel
    // listener, so a stray velocity add here must not start the brass loop.
    if (worldPrefersReducedMotion()) return;
    velocity += msPerSec;
    phase = "momentum";
    kickInvalidate(); // wake the self-invalidating loop
  },

  snapToNow(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (worldPrefersReducedMotion()) {
        // Instant, honest return.
        velocity = 0;
        phase = "idle";
        stepAccumPx = 0;
        if (scrubOffset.value !== 0) {
          scrubOffset.value = 0;
          notify();
          kickInvalidate();
        }
        resolve();
        return;
      }
      if (phase === "idle" && Math.abs(scrubOffset.value) <= OFFSET_EPS_MS) {
        scrubOffset.value = 0;
        resolve();
        return;
      }
      velocity = 0;
      phase = "snap";
      armOffsetSpring();
      snapResolvers.push(resolve);
      kickInvalidate();
    });
  },

  subscribe(fn: (offsetMs: number) => void): () => void {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  },
};

// ── The rubber-band edge (pure exponential — no hidden damp state) ───────────
function applyRubberBand(dt: number): void {
  const { lo, hi } = offsetBounds();
  if (scrubOffset.value > hi) {
    const pull = 1 - Math.pow(0.5, dt / RUBBER_HALFLIFE_S);
    scrubOffset.value -= (scrubOffset.value - hi) * pull;
    velocity *= Math.pow(0.5, dt / EDGE_BLEED_HALFLIFE_S);
    if (scrubOffset.value > hi + RUBBER_MAX_MS) scrubOffset.value = hi + RUBBER_MAX_MS;
  } else if (scrubOffset.value < lo) {
    const pull = 1 - Math.pow(0.5, dt / RUBBER_HALFLIFE_S);
    scrubOffset.value += (lo - scrubOffset.value) * pull;
    velocity *= Math.pow(0.5, dt / EDGE_BLEED_HALFLIFE_S);
    if (scrubOffset.value < lo - RUBBER_MAX_MS) scrubOffset.value = lo - RUBBER_MAX_MS;
  }
}

// ── The self-invalidating frame loop (early-exits to the idle regime) ────────
function stepScrub(rawDelta: number, invalidate: () => void): void {
  if (phase === "idle") return; // demand NOTHING while idle (§4.1)
  const dt = Math.min(rawDelta, MAX_FRAME_DT);
  const before = scrubOffset.value;

  if (phase === "snap") {
    const moving = easing.damp(scrubOffset, "value", 0, SNAP_SMOOTH, dt);
    if (!moving) {
      scrubOffset.value = 0;
      phase = "idle";
    }
  } else if (phase === "momentum") {
    scrubOffset.value += velocity * dt; // integrate
    velocity *= Math.pow(0.5, dt / FRICTION_HALFLIFE_S); // heavy exp friction
    applyRubberBand(dt);
    if (Math.abs(velocity) < DETENT_ENGAGE_VEL) {
      const { lo, hi } = offsetBounds();
      detentTarget = clamp(nearestDetentOffset(scrubOffset.value), lo, hi);
      velocity = 0;
      armOffsetSpring();
      phase = "detent";
    }
  } else {
    // detent: critically-damped catch on the nearest half-hour
    const moving = easing.damp(scrubOffset, "value", detentTarget, DETENT_SMOOTH, dt);
    if (!moving) {
      scrubOffset.value = detentTarget;
      phase = "idle";
    }
  }

  if (scrubOffset.value !== before) notify();

  if (phase === "idle") {
    resolveSnaps(); // the snap/settle reached home this (rendered) frame
  } else {
    invalidate(); // keep the loop alive; self-sustains under demand mode
  }
}

// ── Reduced-motion discrete stepping (§honesty) ──────────────────────────────
function stepDiscrete(deltaPx: number, invalidate: () => void): void {
  stepAccumPx += deltaPx;
  const { lo, hi } = offsetBounds();
  let changed = false;
  while (Math.abs(stepAccumPx) >= STEP_PX) {
    const dir = stepAccumPx > 0 ? 1 : -1;
    const next = clamp(scrubOffset.value + dir * STEP_MS, lo, hi);
    stepAccumPx -= dir * STEP_PX;
    if (next !== scrubOffset.value) {
      scrubOffset.value = next;
      changed = true;
    }
  }
  if (changed) {
    notify();
    invalidate();
  }
}

/**
 * Mount the zoetrope-scrub runtime. Called by `MeridianRing` (M-05) so the hook
 * lives inside the R3F tree (per §M-10): it needs `useThree`/`useFrame` and the
 * canvas DOM element. Registers the real `MeridianBus` impl, drives the momentum
 * loop, listens for wheel/two-finger scrub while the ring is framed, and toggles
 * the CameraRig scrub seam on ring-focus enter/leave. HMR-safe: everything is
 * unregistered/detached on unmount.
 */
export function useRingScrub(): void {
  const invalidate = useThree((s) => s.invalidate);
  const gl = useThree((s) => s.gl);
  const { meridian } = useWorldData();

  // Keep the clamp bounds current (read in render, applied at call time — the
  // layoutRef discipline; never per-frame React state). The loaded slab bounds
  // recompute daily as the provider's minute clock rolls `todayYmd`.
  windowStartMs = meridian.windowStartMs;
  windowEndMs = meridian.windowEndMs;

  // Publish the invalidate kick so the (module-scope) bus methods can wake the
  // loop from outside React (wheel handler, CameraRig's Esc snapToNow).
  kickInvalidate = invalidate;

  // The self-invalidating momentum/snap/detent loop. Early-returns while idle.
  useFrame((_, delta) => {
    stepScrub(delta, invalidate);
  });

  // Register the real MeridianBus implementation (HMR-safe unregister).
  useEffect(() => {
    const unregister = __registerMeridianBusImpl(impl);
    return () => {
      unregister();
      kickInvalidate = NOOP;
    };
  }, []);

  // Capture-phase wheel listener on the canvas. Two-finger swipe IS a wheel
  // event on macOS (no gesture lib). Only acts while the ring is framed (no
  // tablet focused); otherwise it yields so CameraControls' dolly stays normal.
  useEffect(() => {
    const el = gl.domElement;
    const opts: AddEventListenerOptions = { capture: true, passive: false };
    const onWheel = (e: WheelEvent): void => {
      if (!isScrubActive()) return;
      e.preventDefault(); // claim the gesture: scrub time, never scroll the page
      e.stopPropagation();
      const delta =
        Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (delta === 0) return;
      if (worldPrefersReducedMotion()) {
        stepDiscrete(delta, invalidate);
        return;
      }
      impl.addScrubVelocity((delta * MS_DIAL_PER_PX) / FRICTION_TAU_S);
    };
    el.addEventListener("wheel", onWheel, opts);
    return () => {
      el.removeEventListener("wheel", onWheel, opts);
    };
  }, [gl, invalidate]);

  // Toggle the CameraRig wheel/dolly suspension on ring-focus enter/leave.
  useEffect(() => {
    const sync = (): void => setRingScrubActive(isScrubActive());
    sync();
    const off = focusStack.subscribe(sync);
    return () => {
      off();
      setRingScrubActive(false);
    };
  }, []);
}

export default useRingScrub;
