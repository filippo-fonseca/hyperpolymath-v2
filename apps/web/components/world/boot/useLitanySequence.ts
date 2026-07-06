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
import * as THREE from "three";
import type { CameraPose } from "../data/diffing";
import type { TreeLayoutResult } from "../data/treeLayout";
import { inlayRegistry } from "../env/Atmosphere";
import { STUDIOLO } from "../materials/tokens";

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

// ── §2 · collection + apply ───────────────────────────────────────────────────
//
// The kindle strategy (§2.2): opacity is the one dial every family already
// exposes and nothing else writes. We snapshot each committed material's rest
// opacity/transparent once, zero it before first paint, and drive it back up on
// the §3 timeline. Lights are ramped by intensity; the walnut floor rides the
// key light. NO shared bootProgress signal, NO composer fade, NO edits to the
// frozen units — everything is reached by scene traversal (§2.3 handle table).

/** Linear-space brass for the inlay flash; scratch color (zero alloc in loop). */
const BRASS_LINEAR = new THREE.Color(STUDIOLO.brass);

/** A gettable/settable colored material (inlays are MeshBasicMaterial). */
type ColoredMaterial = THREE.Material & { color: THREE.Color };

/** A material we ramp opacity on, plus its committed rest snapshot. */
interface OpacitySnap {
  mat: THREE.Material;
  opacity: number; // rest opacity (restore target + ramp ceiling)
  transparent: boolean; // rest transparent flag
}

interface LightSnap<L extends THREE.Light> {
  light: L;
  intensity: number; // rest intensity
}

/** The drei `<Text>` ref surface the conductor mutates (troika mesh). */
export interface TroikaText extends THREE.Mesh {
  text: string;
  fillOpacity: number;
  sync: (callback?: () => void) => void;
}

/** Everything the Litany darkens then kindles, snapshotted once (§2.3). */
export interface KindleTargets {
  orderedAreaIds: string[]; // layout.boughs order — the stagger index contract
  inlayByArea: Map<string, ColoredMaterial>;
  boughByArea: Map<string, OpacitySnap>;
  sap: OpacitySnap | null;
  brass: OpacitySnap | null; // dais + trunk share ONE hologram material
  core: OpacitySnap | null; // merged vein material — never touch .color (breath owns it)
  lanternBody: OpacitySnap | null;
  lanternRing: OpacitySnap | null;
  embers: OpacitySnap | null;
  tapers: OpacitySnap | null;
  fireflies: OpacitySnap | null;
  dust: OpacitySnap | null;
  keyLight: LightSnap<THREE.PointLight> | null;
  moonLight: LightSnap<THREE.DirectionalLight> | null;
}

/** The camera-anchored refs `applyTimeline` reaches into. */
export interface TimelineRefs {
  shutter: THREE.Mesh | null;
  greeting: TroikaText | null;
}

/** Snapshot a material's rest opacity/transparent, then force transparent for
 *  the boot so `opacity 0` fully hides it (toggling `transparent` is blend-state
 *  only — no recompile, per §2.2). */
function snapMaterial(mat: THREE.Material): OpacitySnap {
  const snap: OpacitySnap = {
    mat,
    opacity: mat.opacity,
    transparent: mat.transparent,
  };
  mat.transparent = true;
  return snap;
}

function firstMaterial(obj: THREE.Object3D): THREE.Material | null {
  const m = (obj as THREE.Mesh).material;
  if (!m) return null;
  return Array.isArray(m) ? (m[0] ?? null) : m;
}

/**
 * Walk the committed scene + `inlayRegistry` once and snapshot every handle in
 * the §2.3 table. Dev-warns on any missing handle (an archive race or a wiring
 * regression). Called from a layout effect keyed on `[layout]`.
 */
export function collectTargets(
  scene: THREE.Scene,
  layout: TreeLayoutResult,
): KindleTargets {
  const targets: KindleTargets = {
    orderedAreaIds: [],
    inlayByArea: new Map(),
    boughByArea: new Map(),
    sap: null,
    brass: null,
    core: null,
    lanternBody: null,
    lanternRing: null,
    embers: null,
    tapers: null,
    fireflies: null,
    dust: null,
    keyLight: null,
    moonLight: null,
  };

  let trunkGroup: THREE.Object3D | null = null;
  let boughsGroup: THREE.Object3D | null = null;
  let lanternsGroup: THREE.Object3D | null = null;

  scene.traverse((o) => {
    switch (o.name) {
      case "trunk":
        trunkGroup = o;
        return;
      case "boughs":
        boughsGroup = o;
        return;
      case "lanterns":
        lanternsGroup = o;
        return;
      case "embers": {
        const m = firstMaterial(o);
        if (m) targets.embers = snapMaterial(m);
        return;
      }
      case "ember-filaments": {
        const m = firstMaterial(o);
        if (m) targets.tapers = snapMaterial(m);
        return;
      }
      case "fireflies": {
        const m = firstMaterial(o);
        if (m) targets.fireflies = snapMaterial(m);
        return;
      }
    }
    if ((o as THREE.PointLight).isPointLight && targets.keyLight === null) {
      const l = o as THREE.PointLight;
      targets.keyLight = { light: l, intensity: l.intensity };
    } else if (
      (o as THREE.DirectionalLight).isDirectionalLight &&
      targets.moonLight === null
    ) {
      const l = o as THREE.DirectionalLight;
      targets.moonLight = { light: l, intensity: l.intensity };
    } else if ((o as THREE.Points).isPoints && targets.dust === null) {
      const m = firstMaterial(o);
      if (m) targets.dust = snapMaterial(m);
    }
  });

  // Trunk group: sap = the MeshBasicMaterial mesh; brass = the shared hologram.
  if (trunkGroup !== null) {
    for (const child of (trunkGroup as THREE.Object3D).children) {
      const m = firstMaterial(child);
      if (m === null) continue;
      if ((m as THREE.MeshBasicMaterial).isMeshBasicMaterial) {
        targets.sap = snapMaterial(m);
      } else if (
        (m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial &&
        targets.brass === null
      ) {
        targets.brass = snapMaterial(m); // dais + trunk share one instance
      }
    }
  }

  // Boughs group: outer limbs carry userData.kind === "bough"; the merged core
  // vein is the one mesh WITHOUT that flag.
  if (boughsGroup !== null) {
    for (const child of (boughsGroup as THREE.Object3D).children) {
      const m = firstMaterial(child);
      if (m === null) continue;
      if (child.userData && child.userData.kind === "bough") {
        targets.boughByArea.set(child.userData.areaId as string, snapMaterial(m));
      } else {
        targets.core = snapMaterial(m);
      }
    }
  }

  // Lanterns group: body Instances use a MeshPhysicalMaterial (hologram); class
  // rings use a plain MeshStandardMaterial. Physical extends Standard, so test
  // physical FIRST.
  if (lanternsGroup !== null) {
    (lanternsGroup as THREE.Object3D).traverse((o) => {
      const m = firstMaterial(o);
      if (m === null) return;
      if ((m as THREE.MeshPhysicalMaterial).isMeshPhysicalMaterial) {
        if (targets.lanternBody === null) targets.lanternBody = snapMaterial(m);
      } else if (
        (m as THREE.MeshStandardMaterial).isMeshStandardMaterial &&
        targets.lanternRing === null
      ) {
        targets.lanternRing = snapMaterial(m);
      }
    });
  }

  // Inlays: walk layout.boughs order (the order contract); the registry is the
  // handle store. Their frozen rest is opacity 0, so no snapshot is needed.
  for (const b of layout.boughs) {
    targets.orderedAreaIds.push(b.areaId);
    const mat = inlayRegistry.get(b.areaId);
    if (mat !== undefined) {
      mat.transparent = true; // already true by contract; harmless
      targets.inlayByArea.set(b.areaId, mat as ColoredMaterial);
    } else if (process.env.NODE_ENV !== "production") {
      console.warn(
        `[Litany] no inlay material for area "${b.areaId}" (archive race?)`,
      );
    }
  }

  if (process.env.NODE_ENV !== "production") {
    const missing: string[] = [];
    if (targets.sap === null) missing.push("trunk sap");
    if (targets.brass === null) missing.push("trunk/dais brass");
    if (targets.core === null && layout.boughs.length > 0) missing.push("bough core");
    if (targets.keyLight === null) missing.push("key pointLight");
    if (targets.moonLight === null) missing.push("moon directionalLight");
    if (targets.dust === null) missing.push("dust motes");
    if (missing.length > 0) {
      console.warn(`[Litany] missing kindle handles: ${missing.join(", ")}`);
    }
  }

  return targets;
}

/** opacity ramp helper: eased progress across [start,end] scaled to the rest
 *  ceiling (the snapshot). */
function ramp(
  snap: OpacitySnap | null,
  t: number,
  start: number,
  end: number,
  ease: (u: number) => number,
): void {
  if (snap === null) return;
  snap.mat.opacity = ease(progress(t, start, end)) * snap.opacity;
}

/**
 * Stateless, allocation-free: compute EVERY animated value from absolute `t`
 * (ms since play start) and write it (§2.4/§3). Callable with any `t` — that
 * makes skip trivial (`applyTimeline(T_END)`), dropped frames harmless, and the
 * layout-effect re-collect a one-liner.
 */
export function applyTimeline(
  t: number,
  targets: KindleTargets,
  refs: TimelineRefs,
): void {
  // Shutter — the true-dark first second.
  if (refs.shutter !== null) {
    const mat = refs.shutter.material as THREE.Material;
    if (t < SHUTTER_FADE_START) mat.opacity = 1;
    else if (t < SHUTTER_FADE_END)
      mat.opacity =
        1 - inOutQuad(progress(t, SHUTTER_FADE_START, SHUTTER_FADE_END));
    else mat.opacity = 0;
    refs.shutter.visible = t < SHUTTER_FADE_END;
  }

  // The candle-point, the room, the tree body.
  ramp(targets.sap, t, SAP_START, SAP_END, outCubic);
  ramp(targets.brass, t, BRASS_START, BRASS_END, outCubic);
  ramp(targets.core, t, CORE_START, CORE_END, inOutQuad);
  ramp(targets.dust, t, DUST_START, DUST_END, (u) => u); // linear
  ramp(targets.lanternBody, t, LANTERN_BODY_START, LANTERN_BODY_END, outCubic);
  ramp(targets.lanternRing, t, LANTERN_RING_START, LANTERN_RING_END, outCubic);
  ramp(targets.embers, t, EMBER_START, EMBER_END, outCubic);
  ramp(targets.tapers, t, TAPER_START, TAPER_END, outCubic);
  ramp(targets.fireflies, t, FIREFLY_START, FIREFLY_END, outCubic);

  // Lights raise the walnut floor (candle catches; moon fills).
  if (targets.keyLight !== null) {
    targets.keyLight.light.intensity =
      inOutQuad(progress(t, KEYLIGHT_START, KEYLIGHT_END)) *
      targets.keyLight.intensity;
  }
  if (targets.moonLight !== null) {
    targets.moonLight.light.intensity =
      inOutQuad(progress(t, MOON_START, MOON_END)) * targets.moonLight.intensity;
  }

  // The signature move: inlays walk outward, each bough limb catching 450 ms
  // after its own floor line reaches the trunk (§4). One schedule, two actors.
  const ids = targets.orderedAreaIds;
  const n = ids.length;
  const s = staggerStep(n);
  for (let i = 0; i < n; i++) {
    const areaId = ids[i]!;
    const start = STAGGER_BASE_START + i * s;

    const inlay = targets.inlayByArea.get(areaId);
    if (inlay !== undefined) {
      inlay.opacity =
        outCubic(progress(t, start, start + INLAY_OPACITY_MS)) *
        INLAY_FINAL_OPACITY;
      const u = clamp01((t - start) / INLAY_COLOR_MS);
      const colorMul = 1 + INLAY_COLOR_OVERSHOOT * (1 - u) * (1 - u);
      inlay.color.copy(BRASS_LINEAR).multiplyScalar(colorMul);
    }

    const bough = targets.boughByArea.get(areaId);
    if (bough !== undefined) {
      const bstart = start + BOUGH_OFFSET;
      bough.mat.opacity =
        outCubic(progress(t, bstart, bstart + BOUGH_KINDLE_MS)) * bough.opacity;
    }
  }

  // The whispered line's fade (its TEXT slice is mutated in the frame loop).
  if (refs.greeting !== null) {
    refs.greeting.visible = t >= GREETING_START && t < GREETING_FADE_END;
    const fill =
      t < GREETING_FADE_START
        ? 1
        : 1 - inOutQuad(progress(t, GREETING_FADE_START, GREETING_FADE_END));
    const mat = refs.greeting.material as THREE.Material | undefined;
    if (mat) mat.opacity = fill;
  }
}

/** Restore ONLY the transparent flags toggled for the boot (§3 finals). */
function restoreTransparent(targets: KindleTargets): void {
  for (const snap of [targets.sap, targets.core, targets.lanternRing]) {
    if (snap !== null) snap.mat.transparent = snap.transparent;
  }
}

/** Full snapshot restore (opacity + transparent + intensity) — cleanup only,
 *  so a mid-boot unmount never leaves the world dark (§2.4). Inlays revert to
 *  their frozen rest (opacity 0, base brass). */
function restoreAll(targets: KindleTargets): void {
  const opac = [
    targets.sap,
    targets.brass,
    targets.core,
    targets.lanternBody,
    targets.lanternRing,
    targets.embers,
    targets.tapers,
    targets.fireflies,
    targets.dust,
  ];
  for (const snap of opac) {
    if (snap !== null) {
      snap.mat.opacity = snap.opacity;
      snap.mat.transparent = snap.transparent;
    }
  }
  for (const snap of targets.boughByArea.values()) {
    snap.mat.opacity = snap.opacity;
    snap.mat.transparent = snap.transparent;
  }
  for (const mat of targets.inlayByArea.values()) {
    mat.opacity = 0;
    mat.color.copy(BRASS_LINEAR);
  }
  if (targets.keyLight !== null)
    targets.keyLight.light.intensity = targets.keyLight.intensity;
  if (targets.moonLight !== null)
    targets.moonLight.light.intensity = targets.moonLight.intensity;
}
