"use client";

/**
 * useLitanySequence.ts — U-17 · The Studiolo · litany-bootup
 *
 * The conductor of the ~6-second "Tree at Night" WAKE. This module is split in
 * three:
 *
 *   1. THE PURE LAYER (this section) — the boot decision, the signature stagger
 *      schedule, the greeting composer, easings, poses, and the §3 keyframe
 *      constants. All exported and side-effect-free so the Vitest suite can
 *      exercise them without a WebGL context (see `__tests__/`).
 *   2. COLLECTION + APPLY — `collectTargets(scene, layout)` snapshots the
 *      committed materials/lights the Litany choreographs (per the §2.3 handle
 *      table) and `applyTimeline(t, targets, refs)` drives every value from
 *      absolute time `t` (stateless, allocation-free).
 *   3. THE HOOK — `useLitanySequence(opts)`: the layout-effect zeroing, the
 *      mount effect (session flag, flight 1, chime, skip listeners, boot-complete
 *      emit), the ONE `useFrame` clock loop, and full snapshot restore on cleanup.
 *
 * It consumes the FROZEN wave-1/2/3 contracts and modifies none of them:
 *   - `worldEvents` (../data/diffing): EMITs "boot-complete" once per mount,
 *     optionally "chime".
 *   - `inlayRegistry` (../env/Atmosphere): walked in `layout.boughs` order.
 *   - `cameraBus.flyTo` / `VESTIBULE_POSE` (../camera/CameraRig): the two-short-
 *     flights establishing move (the bus clamps smoothTime, so no long dolly).
 *   - `EB_GARAMOND_ITALIC` / `preloadWorldFonts` (../text/fonts).
 */

import { format } from "date-fns";
import type { CameraPose } from "../data/diffing";

// ── §11 · public types ──────────────────────────────────────────────────────

/** The persisted per-tab flag key: the litany plays once per browser session. */
export const LITANY_SESSION_KEY = "world:litanyPlayed";

export type LitanyMode = "play" | "instant";

// ── §1 · the boot decision (pure — decided once per mount, in render) ─────────

/**
 * Decide the boot mode. Checked in this order (§1):
 *   1. `prefers-reduced-motion: reduce`  → instant
 *   2. an existing session flag (a same-tab revisit) → instant
 *   3. otherwise → play
 *
 * Every input is synchronous; storage errors are treated as "unplayed"
 * (mirroring ModeToggle's best-effort pattern). SSR renders resolve to
 * "instant" (no window) so nothing schedules a timeline server-side.
 */
export function decideLitanyMode(): LitanyMode {
  if (typeof window === "undefined") return "instant";
  try {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "instant";
    }
  } catch {
    // matchMedia unavailable — fall through, treat as motion-allowed.
  }
  try {
    if (window.sessionStorage.getItem(LITANY_SESSION_KEY) !== null) {
      return "instant";
    }
  } catch {
    // storage error → treat as unplayed (play).
  }
  return "play";
}

// ── §3 · timeline constants (all times ms from t0 = play start) ───────────────

/** Felt end of the timeline; all values are exactly at rest at/after this. */
export const T_END = 5800;
/** Hard ceiling for the boot-complete emit — 1.2 s inside CameraRig's 8 s failsafe. */
export const HARD_CEILING = 6800;

// Shutter (the Litany's own Nightwalnut quad).
export const SHUTTER_HOLD_MS = 300; // opacity held at 1 (true dark)
export const SHUTTER_FADE_START = 300;
export const SHUTTER_FADE_END = 1000; // opacity 1→0; visible=false after this

// Trunk sap — the candle-point (first thing alive).
export const SAP_START = 200;
export const SAP_END = 1200;

// Trunk + dais brass.
export const BRASS_START = 600;
export const BRASS_END = 1800;

// Key pointLight — the candle catches, the walnut floor emerges.
export const KEYLIGHT_START = 700;
export const KEYLIGHT_END = 2600;

// Bough core veins (merged, one material).
export const CORE_START = 1600;
export const CORE_END = 3900;

// Dust motes.
export const DUST_START = 1400;
export const DUST_END = 3200;

// Moon fill (directionalLight).
export const MOON_START = 2000;
export const MOON_END = 3800;

// Lanterns (bodies + class rings).
export const LANTERN_BODY_START = 2900;
export const LANTERN_BODY_END = 4100;
export const LANTERN_RING_START = 3100;
export const LANTERN_RING_END = 4300;

// Embers + tapers.
export const EMBER_START = 3500;
export const EMBER_END = 4700;
export const TAPER_START = 3600;
export const TAPER_END = 4800;

// Fireflies.
export const FIREFLY_START = 4300;
export const FIREFLY_END = 5100;

// The whispered greeting line.
export const GREETING_START = 3800;
export const GREETING_CPS_MS = 45; // ms per character
export const GREETING_FADE_START = 5300;
export const GREETING_FADE_END = 5800;

// Camera flights (§5).
export const FLIGHT1_MS = 600; // cut-to-start, behind the shutter
export const FLIGHT2_AT = 3400; // the establishing push-in dispatched here
export const FLIGHT2_MS = 900;
export const SKIP_FLIGHT_MS = 600; // a comfortable settle on skip

// Soft wake tone.
export const CHIME_AT = 900;

// ── §4 · the inlay / bough stagger (the signature move) ───────────────────────

export const STAGGER_BASE_START = 900; // first inlay ignites here
export const STAGGER_SPAN = 1900; // last start ≤ 900 + 1900 = 2800
export const STAGGER_STEP_MAX = 320; // per-inlay step cap
export const INLAY_OPACITY_MS = 450; // opacity 0→1 envelope
export const INLAY_COLOR_MS = 800; // color scalar 2.6→1.0 envelope
export const INLAY_COLOR_OVERSHOOT = 1.6; // colorMul = 1 + 1.6·(1-u)²  → 2.6→1.0
export const INLAY_FINAL_OPACITY = 1.0;
export const BOUGH_OFFSET = 450; // bough limb kindles this long after its inlay
export const BOUGH_KINDLE_MS = 700; // bough opacity envelope

/** The per-inlay stagger step for N boughs (§4). */
export function staggerStep(boughCount: number): number {
  return boughCount > 1
    ? Math.min(STAGGER_STEP_MAX, STAGGER_SPAN / (boughCount - 1))
    : 0;
}

/**
 * Pure schedule for the signature stagger (§4). Exported for tests.
 *
 * `inlayStart[i] = 900 + i·S`, `boughStart[i] = inlayStart[i] + 450`, where
 * `S = min(320, 1900/(N-1))` (0 when N ≤ 1). The last ignition always starts
 * ≤ 2800 ms.
 */
export function litanySchedule(boughCount: number): {
  inlayStart: number[];
  boughStart: number[];
} {
  const s = staggerStep(boughCount);
  const inlayStart: number[] = [];
  const boughStart: number[] = [];
  for (let i = 0; i < boughCount; i++) {
    const start = STAGGER_BASE_START + i * s;
    inlayStart.push(start);
    boughStart.push(start + BOUGH_OFFSET);
  }
  return { inlayStart, boughStart };
}

// ── §6 · the greeting ─────────────────────────────────────────────────────────

/**
 * Compose the whispered greeting once at mount (§6). Exported for tests.
 * `hour < 12` → morning, `< 18` → afternoon, else evening; then the date via
 * `date-fns` `format(now, "EEEE, MMMM do")`. e.g. "Good evening. Monday, July 6th."
 * Every glyph is covered by `WORLD_GLYPH_SET`. No name — second-person-silent.
 */
export function composeGreeting(now: Date): string {
  const hour = now.getHours();
  const salute =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${salute}. ${format(now, "EEEE, MMMM do")}.`;
}

// ── §3 · easings ──────────────────────────────────────────────────────────────

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Linear progress of `t` across `[start, end]`, clamped to [0,1]. */
export function progress(t: number, start: number, end: number): number {
  if (end <= start) return t >= end ? 1 : 0;
  return clamp01((t - start) / (end - start));
}

export function outCubic(u: number): number {
  const v = 1 - u;
  return 1 - v * v * v;
}

export function inOutQuad(u: number): number {
  return u < 0.5 ? 2 * u * u : 1 - (-2 * u + 2) * (-2 * u + 2) / 2;
}

// ── §5 · the establishing camera move ─────────────────────────────────────────

// Imported from CameraRig so the pose SHAPE stays exact; re-declared here as the
// Litany's own start pose (§5): low and pulled back, the eye of someone who just
// opened the door — dais at center frame, tree crown out of frame above.
export const LITANY_START_POSE: CameraPose = {
  position: [0, 1.15, 8.2],
  target: [0, 1.5, 0],
};
