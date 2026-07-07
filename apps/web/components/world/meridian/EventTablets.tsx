"use client";

/**
 * EventTablets.tsx — M-06 · The Studiolo · Phase 2 (the crown jewel)
 *
 * Every visible Google-Calendar event is a glass tablet riveted to the Meridian
 * Ring. The whole family is ONE imperative `THREE.InstancedMesh(TABLET_GEOMETRY,
 * …, 128)` (declarative `<Instances>` is REJECTED here — the scrub window-roll
 * mounts/unmounts rows at churn rate, and a per-row React node per tablet would
 * thrash). A SECOND small `InstancedMesh(BAND_GEOMETRY, …, 8)` carries the
 * all-day "lip bands". Two meshes ⇒ exactly TWO draw calls for the tablet layer
 * (PLAN §4.2), plus ONE hero-glass swap at zenith (the ≤3-cap reserve slot) and
 * its single transmission pass.
 *
 * The runtime is a hand-rolled SoA freelist (typed arrays, module scratch),
 * mirroring `tree/Embers.tsx` verbatim in discipline:
 *   - `useWorldData().meridian` is read in RENDER, never per-frame.
 *   - `solveMeridianLayout` runs in a `useEffect` keyed on data identity.
 *   - ONE allocation-free `useFrame` rotates the dial (pure time projection),
 *     rolls the visible window, reclassifies state, and animates enter/leave +
 *     lean + hover. Zero React state per frame (the hero swap is the only React
 *     state, and it only flips at zenith-crossing / minute cadence).
 *
 * TREATY (§2.4): this unit chains a state chunk onto `makeTabletMaterial()` via
 * the ONE sanctioned `chainOnBeforeCompile(mat, inject, "tablet@1")`, using the
 * reserved names EXACTLY — attribute `aTabletState` (itemSize 2: x=state id,
 * y=phase), varying `vTabletState`, uniforms `uMeridianTime` (float s) + `uSepia`
 * (vec3 Sepia Ink), marker comments `<studiolo:tablet:*>`, local prefix `tb`.
 * Program cache key: `studiolo:sf@1` → `studiolo:sf@1|tablet@1`. The sepia mix
 * (past → Sepia Ink, emissive dropped), imminent rim lift (blooms), and current
 * glow are all GPU-side off `uMeridianTime` (advancing only on demanded frames —
 * intended: sleeping tablets demand nothing).
 *
 * THE DIAL (frozen convention, must match M-05's group hierarchy): an outer
 * group at `[0, height, 0]` canted `-cantRad` about X (high side toward the
 * Vestibule camera so the cant reads on look-up); inside it a dial group whose
 * y-rotation is `ringRotationFor(now, scrubOffset, tz)` — pure time projection,
 * NOT decorative animation, evaluated only on demanded frames (PLAN §4.1). A
 * tablet at dial angle θ sits at local `(R sinθ, 0, R cosθ)` (θ=0 ⇒ zenith),
 * tangent-oriented via `rotation.y = θ`; the now-tablet lands at zenith when
 * `θ === timeToAngle(now)` because `worldAngle = θ + ringRotation`.
 *
 * The hover→label seam is `meridianHover.ts` (M-11 subscribes; this unit never
 * creates M-11's caption `<Text>`). Click pushes `{kind:"ring", eventId}` (M-08
 * maps the pose). The T-15 lean-down subscribes to `worldEvents("meridian-toll")`.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type MutableRefObject,
} from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";

import { makeTabletMaterial } from "./meridianMaterials";
import {
  TABLET_GEOMETRY,
  BAND_GEOMETRY,
  RING_RADIUS,
} from "./meridianGeometries";
import { chainOnBeforeCompile, heroGlass } from "../materials/hologram";
import { STUDIOLO } from "../materials/tokens";
import {
  solveMeridianLayout,
  visibleSlots,
  classifyTablet,
  resolveOverlaps,
  ringRotationFor,
  MERIDIAN_CONFIG_DEFAULTS,
  type TabletSlot,
} from "./meridianLayout";
import { TABLET_VISUALS, TABLET_STATE_ID } from "./meridianMappings";
import { hash01 } from "../data/treeLayout";
import { useWorldData } from "../data/useWorldData";
import { worldEvents, diffEventSnapshots } from "../data/diffing";
import { meridianBus } from "./meridianBus";
import { tabletHoverBus } from "./meridianHover";
import { focusStack } from "../camera/useFocusStack";
import { worldPrefersReducedMotion } from "../prefs/useWorldPrefs";
import type { GcalEventDTO } from "@/lib/gcal/event-dto";

// ── Caps + geometry constants ───────────────────────────────────────────────
const MAX_TABLETS = MERIDIAN_CONFIG_DEFAULTS.tabletCap; // 128
const MAX_BANDS = 8;
const RING_HEIGHT = MERIDIAN_CONFIG_DEFAULTS.height; // 8.5
const RING_CANT = MERIDIAN_CONFIG_DEFAULTS.cantRad; // 28° — applied as -cant (§dial)
const LANE_GAP = 0.45; // radial offset per overlap lane
const BAND_LANE_GAP = 0.08; // y lift per stacked all-day band

// ── Motion tuning ───────────────────────────────────────────────────────────
const SPRING_LAMBDA = 12; // enter/leave scale damp (drei/MathUtils convention)
const POP_LAMBDA = 6; // rivet-in emissive pop decay
const LEAN_LAMBDA = 3.5; // ~900 ms deferential lean (VISION §5.4)
const HOVER_SMOOTH = 0.12; // maath-style hover damp (~120 ms) via MathUtils.damp
const ENTER_POP = 1.8; // instanceColor pop on a genuinely-new (Jarvis-riveted) tablet
const HOVER_LEAN = (2 * Math.PI) / 180; // 2° hover lean (§M-06)
const HOVER_BRIGHT = 0.4; // hover rim/brightness lift
const CLOCK_WRAP = 600; // uMeridianTime wrap (phase-invisible)

// ── Reconcile / classify cadence gates (demand-mode discipline) ─────────────
// The dial rotation is set EVERY demanded frame (cheap). The heavy passes are
// gated so idle costs ~1 frame/min and scrub costs at most ~20 reconciles/s.
const RECONCILE_CENTER_EPS_MS = 60_000; // window rolls when center moves > 1 min of dial
const RECONCILE_WALL_THROTTLE_MS = 50; // ≤20 window-roll reconciles / real second
const CLASSIFY_EPS_MS = 5_000; // reclassify past/imminent/current every ~5 s of frames
const HERO_ZENITH_THRESH = (16 * Math.PI) / 180; // hero only within ±16° of zenith

// ── The GPU clock + sepia uniform (module singletons, captured by compile) ──
// The SAME objects `useFrame` / build mutate; they survive material re-creation
// across remounts (mirrors Embers' `emberUniforms`).
const _sepia = new THREE.Color(STUDIOLO.sepiaInk); // hex → linear under r185
const tabletUniforms = {
  uMeridianTime: { value: 0 },
  uSepia: { value: new THREE.Vector3(_sepia.r, _sepia.g, _sepia.b) },
};

// ── GLSL chunks (§2.4 treaty; literals interpolated from TABLET_VISUALS) ─────
const f = (n: number): string => n.toFixed(4);
const V = TABLET_VISUALS;

const VERT_COMMON_ANCHOR = "#include <common>";
const VERT_COMMON_INJECTION = `#include <common>
// <studiolo:tablet:vdecl>
attribute vec2 aTabletState;
varying vec2 vTabletState;
// </studiolo:tablet:vdecl>`;

const VERT_BEGIN_ANCHOR = "#include <begin_vertex>";
const VERT_BEGIN_INJECTION = `#include <begin_vertex>
// <studiolo:tablet:vstate>
vTabletState = aTabletState;
// </studiolo:tablet:vstate>`;

const FRAG_COMMON_ANCHOR = "#include <common>";
const FRAG_COMMON_INJECTION = `#include <common>
// <studiolo:tablet:fdecl>
varying vec2 vTabletState;
uniform float uMeridianTime;
uniform vec3 uSepia;
// </studiolo:tablet:fdecl>`;

// Runs AFTER U-03's fresnel rim (chain order). The base rim intensity is set to
// the "upcoming" baseline (see buildSystem), so this chunk only adds per-state
// DELTAS: past dims + mixes toward Sepia Ink; imminent lifts the rim past 1
// (blooms) with a slow breath; current holds a steady candleflame glow.
// `uRimColor` is declared by the fresnel decl (same fragment scope) — treaty
// rule: only read names the base already provides.
const FRAG_EMISSIVE_ANCHOR = "#include <emissivemap_fragment>";
const FRAG_EMISSIVE_INJECTION = `#include <emissivemap_fragment>
// <studiolo:tablet:state>
{
  float tbState = vTabletState.x;
  if ( tbState < 0.5 ) {
    // past — the journal already written: mix toward Sepia Ink, drop the rim.
    diffuseColor.rgb = mix( diffuseColor.rgb, uSepia, ${f(V.past.sepiaMix)} );
    totalEmissiveRadiance *= ${f(V.past.emissive / V.upcoming.rimIntensity)};
  } else if ( tbState < 1.5 ) {
    // upcoming — parchment calm (the base rim baseline already applied).
  } else if ( tbState < 2.5 ) {
    // imminent — candleflame rim lift > 1 (blooms) + a slow deferential breath.
    float tbPulse = 0.5 + 0.5 * sin( 6.2831853 * 0.6 * uMeridianTime + vTabletState.y );
    totalEmissiveRadiance += uRimColor * ${f(V.imminent.rimIntensity - V.upcoming.rimIntensity)} * ( 0.7 + 0.3 * tbPulse );
  } else {
    // current — the one true glass: steady candleflame glow at zenith.
    totalEmissiveRadiance += uRimColor * ${f(V.current.rimIntensity - V.upcoming.rimIntensity)};
  }
}
// </studiolo:tablet:state>`;

/**
 * The ONE tablet-state decorator. Chained AFTER the fresnel injector via
 * `chainOnBeforeCompile` (base chunk lands first). Two vertex replaces + two
 * fragment replaces, each preserving its anchor, plus the uniform wire.
 */
function injectTabletChunk(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  shader.uniforms.uMeridianTime = tabletUniforms.uMeridianTime;
  shader.uniforms.uSepia = tabletUniforms.uSepia;
  shader.vertexShader = shader.vertexShader
    .replace(VERT_COMMON_ANCHOR, VERT_COMMON_INJECTION)
    .replace(VERT_BEGIN_ANCHOR, VERT_BEGIN_INJECTION);
  shader.fragmentShader = shader.fragmentShader
    .replace(FRAG_COMMON_ANCHOR, FRAG_COMMON_INJECTION)
    .replace(FRAG_EMISSIVE_ANCHOR, FRAG_EMISSIVE_INJECTION);
}

// ── Module scratch — the ONLY objects the loops touch ────────────────────────
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _c = new THREE.Color();
const _desiredTimed = new Set<string>();
const _desiredBands = new Set<string>();

/**
 * FROZEN pick map (instanceId → eventId) for resident tablets — the raycast
 * seam (mirrors `emberPickMap` / `lanternPickMap`). Rebuilt by reconcile; entries
 * removed when a slot frees.
 */
const _tabletPickMap = new Map<number, string>();
export const tabletPickMap: ReadonlyMap<number, string> = _tabletPickMap;

// ── Runtime (module-internal, per-mount, NEVER React state) ─────────────────
interface TabletRuntime {
  index: Map<string, number>; // repEventId → slot (resident placements)
  leaving: Map<string, number>; // repEventId → slot, spring-out in progress
  free: number[]; // freelist stack, seeded [127..0]
  alive: Uint8Array;
  hidden: Uint8Array; // 1 = hero-swapped (instance scaled to 0)
  baseAngle: Float32Array; // dial angle θ (rad)
  baseRadius: Float32Array; // ring radius + lane offset
  spanX: Float32Array; // arc span (rad) → instance scale.x
  scale: Float32Array;
  scaleTarget: Float32Array;
  lean: Float32Array; // current lean (rad, about the tangent)
  leanTarget: Float32Array;
  hoverAmt: Float32Array;
  hoverTarget: Float32Array;
  pop: Float32Array; // instanceColor HDR multiplier, decays → 1
  stateId: Uint8Array; // aTabletState.x mirror
  baseColor: Float32Array; // 3× linear RGB tint
  colorHex: (string | null)[]; // sRGB hex per slot (for the hero-glass tint)
  highWater: number;
  motion: boolean;
  // — window-roll / classify bookkeeping —
  slots: TabletSlot[]; // all solved slots (from the data effect)
  byEvent: Map<string, TabletSlot>;
  tz: string;
  reduced: boolean;
  resync: boolean; // data identity changed → full reconcile next frame
  pendingAdded: Set<string>; // genuinely-new eventIds (rivet-in pop)
  tollActive: Set<string>; // eventIds currently leaning from a toll
  lastCenterMs: number;
  lastClassifyMs: number;
  lastReconcileWall: number;
}

interface BandRuntime {
  index: Map<string, number>;
  leaving: Map<string, number>;
  free: number[];
  alive: Uint8Array;
  laneY: Float32Array;
  scale: Float32Array;
  scaleTarget: Float32Array;
  baseColor: Float32Array; // 3× linear RGB tint
  highWater: number;
}

interface HeroDesc {
  eventId: string;
  slot: number;
  position: [number, number, number];
  rotY: number;
  spanX: number;
  tint: string;
}

interface TabletSystem {
  tabletMesh: THREE.InstancedMesh;
  bandMesh: THREE.InstancedMesh;
  tabletMaterial: THREE.MeshPhysicalMaterial;
  bandMaterial: THREE.MeshPhysicalMaterial;
  aTabletState: THREE.InstancedBufferAttribute;
  aStateArr: Float32Array;
  tab: TabletRuntime;
  band: BandRuntime;
}

let warnedCap = false;
function warnCapOnce(): void {
  if (!warnedCap) {
    warnedCap = true;
    console.warn(
      "[studiolo] tablet freelist exhausted (cap 128). Extra events skipped.",
    );
  }
}

// ── Mount-once construction ──────────────────────────────────────────────────
function buildSystem(): TabletSystem {
  _tabletPickMap.clear();

  // Tablet material: the frozen parchment hologram base, chained with the state
  // chunk. Body color forced WHITE so `instanceColor` IS the per-slot tint
  // (mirrors Embers); DoubleSide so a thin plaque reads from either face as you
  // orbit; base rim intensity dropped to the "upcoming" baseline so the state
  // chunk can add per-state deltas on top.
  const tabletMaterial = makeTabletMaterial();
  tabletMaterial.color.setRGB(1, 1, 1);
  tabletMaterial.side = THREE.DoubleSide;
  const rimU = tabletMaterial.userData.rimUniforms as
    | { uRimIntensity: { value: number } }
    | undefined;
  if (rimU !== undefined) rimU.uRimIntensity.value = V.upcoming.rimIntensity;
  chainOnBeforeCompile(tabletMaterial, injectTabletChunk, "tablet@1");
  tabletMaterial.userData.tabletUniforms = tabletUniforms; // dev-harness mirror

  // aTabletState attribute on the shared geometry singleton — idempotent (HMR).
  let aTabletState = TABLET_GEOMETRY.getAttribute("aTabletState") as
    | THREE.InstancedBufferAttribute
    | undefined;
  if (aTabletState === undefined) {
    aTabletState = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_TABLETS * 2),
      2,
    );
    aTabletState.setUsage(THREE.DynamicDrawUsage);
    TABLET_GEOMETRY.setAttribute("aTabletState", aTabletState);
  }
  const aStateArr = aTabletState.array as Float32Array;

  const tabletMesh = new THREE.InstancedMesh(
    TABLET_GEOMETRY,
    tabletMaterial,
    MAX_TABLETS,
  );
  tabletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  tabletMesh.frustumCulled = false; // tablets ring the whole canted annulus
  tabletMesh.name = "event-tablets";

  // Band material: a SEPARATE plain hologram base (no state chunk) — all-day
  // bands are quiet parchment glass on the lip; tint via instanceColor.
  const bandMaterial = makeTabletMaterial();
  bandMaterial.color.setRGB(1, 1, 1);
  bandMaterial.side = THREE.DoubleSide;

  const bandMesh = new THREE.InstancedMesh(BAND_GEOMETRY, bandMaterial, MAX_BANDS);
  bandMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bandMesh.frustumCulled = false;
  bandMesh.name = "event-allday-bands";

  // Every slot starts scale-0 + WHITE so the instance buffers exist at first
  // compile (USE_INSTANCING_COLOR → vColor available for the frag chunk).
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.updateMatrix();
  for (let i = 0; i < MAX_TABLETS; i++) {
    tabletMesh.setMatrixAt(i, _dummy.matrix);
    tabletMesh.setColorAt(i, _color.setRGB(1, 1, 1));
  }
  tabletMesh.instanceMatrix.needsUpdate = true;
  if (tabletMesh.instanceColor !== null) {
    tabletMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    tabletMesh.instanceColor.needsUpdate = true;
  }
  for (let i = 0; i < MAX_BANDS; i++) {
    bandMesh.setMatrixAt(i, _dummy.matrix);
    bandMesh.setColorAt(i, _color.setRGB(1, 1, 1));
  }
  bandMesh.instanceMatrix.needsUpdate = true;
  if (bandMesh.instanceColor !== null) {
    bandMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    bandMesh.instanceColor.needsUpdate = true;
  }

  const tab: TabletRuntime = {
    index: new Map(),
    leaving: new Map(),
    free: [],
    alive: new Uint8Array(MAX_TABLETS),
    hidden: new Uint8Array(MAX_TABLETS),
    baseAngle: new Float32Array(MAX_TABLETS),
    baseRadius: new Float32Array(MAX_TABLETS),
    spanX: new Float32Array(MAX_TABLETS),
    scale: new Float32Array(MAX_TABLETS),
    scaleTarget: new Float32Array(MAX_TABLETS),
    lean: new Float32Array(MAX_TABLETS),
    leanTarget: new Float32Array(MAX_TABLETS),
    hoverAmt: new Float32Array(MAX_TABLETS),
    hoverTarget: new Float32Array(MAX_TABLETS),
    pop: new Float32Array(MAX_TABLETS),
    stateId: new Uint8Array(MAX_TABLETS),
    baseColor: new Float32Array(MAX_TABLETS * 3),
    colorHex: new Array<string | null>(MAX_TABLETS).fill(null),
    highWater: 0,
    motion: false,
    slots: [],
    byEvent: new Map(),
    tz: "UTC",
    reduced: false,
    resync: false,
    pendingAdded: new Set(),
    tollActive: new Set(),
    lastCenterMs: Number.NEGATIVE_INFINITY,
    lastClassifyMs: Number.NEGATIVE_INFINITY,
    lastReconcileWall: 0,
  };
  for (let i = MAX_TABLETS - 1; i >= 0; i--) tab.free.push(i);

  const band: BandRuntime = {
    index: new Map(),
    leaving: new Map(),
    free: [],
    alive: new Uint8Array(MAX_BANDS),
    laneY: new Float32Array(MAX_BANDS),
    scale: new Float32Array(MAX_BANDS),
    scaleTarget: new Float32Array(MAX_BANDS),
    baseColor: new Float32Array(MAX_BANDS * 3),
    highWater: 0,
  };
  for (let i = MAX_BANDS - 1; i >= 0; i--) band.free.push(i);

  return {
    tabletMesh,
    bandMesh,
    tabletMaterial,
    bandMaterial,
    aTabletState,
    aStateArr,
    tab,
    band,
  };
}

// ── Per-slot writes ──────────────────────────────────────────────────────────
function writeTabletMatrix(sys: TabletSystem, slot: number): void {
  const rt = sys.tab;
  const s = rt.hidden[slot] === 1 ? 0 : rt.scale[slot];
  const theta = rt.baseAngle[slot];
  const r = rt.baseRadius[slot];
  const lean = rt.lean[slot] + HOVER_LEAN * rt.hoverAmt[slot];
  _dummy.position.set(r * Math.sin(theta), 0, r * Math.cos(theta));
  _dummy.rotation.set(lean, theta, 0, "YXZ"); // Ry(θ) placement, Rx(lean) about tangent
  _dummy.scale.set(rt.spanX[slot] * s, s, s);
  _dummy.updateMatrix();
  sys.tabletMesh.setMatrixAt(slot, _dummy.matrix);
}

function writeTabletColor(sys: TabletSystem, slot: number): void {
  const rt = sys.tab;
  const b = slot * 3;
  const mult = rt.pop[slot] * (1 + HOVER_BRIGHT * rt.hoverAmt[slot]);
  _color.setRGB(
    rt.baseColor[b] * mult,
    rt.baseColor[b + 1] * mult,
    rt.baseColor[b + 2] * mult,
    THREE.LinearSRGBColorSpace,
  );
  sys.tabletMesh.setColorAt(slot, _color);
}

function setTabletTint(sys: TabletSystem, slot: number, hex: string): void {
  _c.set(hex); // sRGB hex → linear
  const b = slot * 3;
  sys.tab.baseColor[b] = _c.r;
  sys.tab.baseColor[b + 1] = _c.g;
  sys.tab.baseColor[b + 2] = _c.b;
  sys.tab.colorHex[slot] = hex;
}

function writeBandMatrix(sys: TabletSystem, slot: number): void {
  const rt = sys.band;
  const s = rt.scale[slot];
  _dummy.position.set(0, rt.laneY[slot], 0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.scale.setScalar(s);
  _dummy.updateMatrix();
  sys.bandMesh.setMatrixAt(slot, _dummy.matrix);
}

function writeBandColor(sys: TabletSystem, slot: number): void {
  const b = slot * 3;
  const rt = sys.band;
  _color.setRGB(rt.baseColor[b], rt.baseColor[b + 1], rt.baseColor[b + 2], THREE.LinearSRGBColorSpace);
  sys.bandMesh.setColorAt(slot, _color);
}

function freeTabletSlot(sys: TabletSystem, slot: number): void {
  const rt = sys.tab;
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.updateMatrix();
  sys.tabletMesh.setMatrixAt(slot, _dummy.matrix);
  rt.alive[slot] = 0;
  rt.hidden[slot] = 0;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 0;
  rt.lean[slot] = 0;
  rt.leanTarget[slot] = 0;
  rt.hoverAmt[slot] = 0;
  rt.hoverTarget[slot] = 0;
  rt.pop[slot] = 1;
  rt.stateId[slot] = 0;
  rt.colorHex[slot] = null;
  rt.free.push(slot);
  _tabletPickMap.delete(slot);
}

function freeBandSlot(sys: TabletSystem, slot: number): void {
  const rt = sys.band;
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.rotation.set(0, 0, 0);
  _dummy.updateMatrix();
  sys.bandMesh.setMatrixAt(slot, _dummy.matrix);
  rt.alive[slot] = 0;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 0;
  rt.free.push(slot);
}

// ── The window-roll reconcile (data change OR scrub roll) ────────────────────
// Recomputes the visible set from the loaded slab and diffs it against the
// resident freelist. Allocates a few small arrays (visibleSlots / resolveOverlaps
// outputs) — but ONLY on data change or a genuine window roll, never on the idle
// steady state or the per-frame animation path (PLAN §4.3 discipline preserved
// where it matters: the sleeping/animating loop below is allocation-free).
function reconcile(
  sys: TabletSystem,
  nowMs: number,
  centerMs: number,
): void {
  const rt = sys.tab;
  const bd = sys.band;
  const reduced = rt.reduced;

  const visible = visibleSlots(rt.slots, centerMs, rt.tz);
  const placements = resolveOverlaps(visible); // timed only, lanes + merges
  const allDay = visible.filter((s) => s.allDay);

  let aStateDirty = false;
  let colorDirty = false;
  let matrixDirty = false;

  // ── Timed tablets ──────────────────────────────────────────────────────────
  _desiredTimed.clear();
  for (const p of placements) _desiredTimed.add(p.slot.eventId);

  // Removals → begin a leave (freed by the frame loop when scale ≈ 0).
  for (const [eventId, slot] of Array.from(rt.index)) {
    if (_desiredTimed.has(eventId)) continue;
    rt.index.delete(eventId);
    if (reduced) {
      freeTabletSlot(sys, slot);
      matrixDirty = true;
    } else {
      rt.leaving.set(eventId, slot);
      rt.scaleTarget[slot] = 0;
    }
  }

  for (const p of placements) {
    const slotDef = p.slot;
    const eventId = slotDef.eventId;
    const radius = RING_RADIUS + p.lane * LANE_GAP;
    const state = classifyTablet(slotDef, nowMs);
    const stateId = TABLET_STATE_ID[state];

    let slot = rt.index.get(eventId);
    if (slot === undefined) {
      const leaving = rt.leaving.get(eventId);
      if (leaving !== undefined) {
        rt.leaving.delete(eventId);
        rt.scaleTarget[leaving] = 1;
        slot = leaving;
        rt.index.set(eventId, slot);
      }
    }

    if (slot === undefined) {
      // Addition: pull a slot, spring in (rivet if genuinely new).
      const fresh = rt.free.pop();
      if (fresh === undefined) {
        warnCapOnce();
        continue;
      }
      slot = fresh;
      rt.index.set(eventId, slot);
      rt.alive[slot] = 1;
      rt.hidden[slot] = 0;
      if (slot + 1 > rt.highWater) rt.highWater = slot + 1;
      rt.scale[slot] = reduced ? 1 : 0;
      rt.scaleTarget[slot] = 1;
      rt.pop[slot] = rt.pendingAdded.has(eventId) && !reduced ? ENTER_POP : 1;
      rt.lean[slot] = 0;
      rt.leanTarget[slot] = 0;
      rt.hoverAmt[slot] = 0;
      rt.hoverTarget[slot] = 0;
      sys.aStateArr[slot * 2 + 1] = hash01(eventId) * Math.PI * 2; // phase, once
      _tabletPickMap.set(slot, eventId);
    }

    // Base placement + tint + state (idempotent for residents).
    rt.baseAngle[slot] = slotDef.angleStart;
    rt.baseRadius[slot] = radius;
    rt.spanX[slot] = slotDef.angleSpan;
    setTabletTint(sys, slot, slotDef.colorHex);
    if (rt.stateId[slot] !== stateId) {
      rt.stateId[slot] = stateId;
      sys.aStateArr[slot * 2] = stateId;
      aStateDirty = true;
    } else {
      sys.aStateArr[slot * 2] = stateId; // ensure set on first placement
    }

    // Toll lean lifecycle: an active toll holds the lean while imminent; once the
    // event turns current (start) or past, ease it back / clear.
    if (rt.tollActive.has(eventId)) {
      if (state === "imminent" && !reduced) {
        rt.leanTarget[slot] = TABLET_VISUALS.imminent.leanRad;
      } else {
        rt.leanTarget[slot] = 0;
        if (state !== "imminent") rt.tollActive.delete(eventId);
      }
    }

    writeTabletMatrix(sys, slot);
    writeTabletColor(sys, slot);
    matrixDirty = true;
    colorDirty = true;
  }

  // ── All-day bands ───────────────────────────────────────────────────────────
  _desiredBands.clear();
  for (const s of allDay) _desiredBands.add(s.eventId);

  for (const [eventId, slot] of Array.from(bd.index)) {
    if (_desiredBands.has(eventId)) continue;
    bd.index.delete(eventId);
    if (reduced) {
      freeBandSlot(sys, slot);
      matrixDirty = true;
    } else {
      bd.leaving.set(eventId, slot);
      bd.scaleTarget[slot] = 0;
    }
  }

  let bandLane = 0;
  for (const s of allDay) {
    const eventId = s.eventId;
    let slot = bd.index.get(eventId);
    if (slot === undefined) {
      const leaving = bd.leaving.get(eventId);
      if (leaving !== undefined) {
        bd.leaving.delete(eventId);
        bd.scaleTarget[leaving] = 1;
        slot = leaving;
        bd.index.set(eventId, slot);
      }
    }
    if (slot === undefined) {
      const fresh = bd.free.pop();
      if (fresh === undefined) continue;
      slot = fresh;
      bd.index.set(eventId, slot);
      bd.alive[slot] = 1;
      if (slot + 1 > bd.highWater) bd.highWater = slot + 1;
      bd.scale[slot] = reduced ? 1 : 0;
      bd.scaleTarget[slot] = 1;
    }
    bd.laneY[slot] = bandLane * BAND_LANE_GAP;
    const bc = bd.baseColor;
    _c.set(s.colorHex);
    bc[slot * 3] = _c.r;
    bc[slot * 3 + 1] = _c.g;
    bc[slot * 3 + 2] = _c.b;
    writeBandMatrix(sys, slot);
    writeBandColor(sys, slot);
    matrixDirty = true;
    colorDirty = true;
    bandLane++;
  }

  if (aStateDirty) sys.aTabletState.needsUpdate = true;
  if (matrixDirty) {
    sys.tabletMesh.instanceMatrix.needsUpdate = true;
    sys.bandMesh.instanceMatrix.needsUpdate = true;
  }
  if (colorDirty) {
    if (sys.tabletMesh.instanceColor !== null)
      sys.tabletMesh.instanceColor.needsUpdate = true;
    if (sys.bandMesh.instanceColor !== null)
      sys.bandMesh.instanceColor.needsUpdate = true;
  }
  rt.motion = true;
}

// ── Classify-only pass (minute tick — no window change) ──────────────────────
function reclassify(sys: TabletSystem, nowMs: number): boolean {
  const rt = sys.tab;
  let aStateDirty = false;
  for (const [eventId, slot] of rt.index) {
    const slotDef = rt.byEvent.get(eventId);
    if (slotDef === undefined) continue;
    const stateId = TABLET_STATE_ID[classifyTablet(slotDef, nowMs)];
    if (rt.stateId[slot] !== stateId) {
      rt.stateId[slot] = stateId;
      sys.aStateArr[slot * 2] = stateId;
      aStateDirty = true;
      // A toll lean eases back the moment the event starts / passes.
      if (rt.tollActive.has(eventId) && stateId !== TABLET_STATE_ID.imminent) {
        rt.leanTarget[slot] = 0;
        rt.tollActive.delete(eventId);
        rt.motion = true;
      }
    }
  }
  if (aStateDirty) sys.aTabletState.needsUpdate = true;
  return aStateDirty;
}

// ── Hero (zenith) selection ──────────────────────────────────────────────────
// Among resident tablets classified current|imminent, the one nearest zenith
// (min |wrap(θ + ringRotation)|) within a tight threshold becomes the hero glass.
// Returns the chosen descriptor or null (nothing at zenith → no swap).
function computeHero(sys: TabletSystem, rotationY: number): HeroDesc | null {
  const rt = sys.tab;
  let bestSlot = -1;
  let bestAbs = HERO_ZENITH_THRESH;
  let bestEvent: string | null = null;
  for (const [eventId, slot] of rt.index) {
    const id = rt.stateId[slot];
    if (id !== TABLET_STATE_ID.current && id !== TABLET_STATE_ID.imminent)
      continue;
    let w = rt.baseAngle[slot] + rotationY;
    w = Math.atan2(Math.sin(w), Math.cos(w)); // wrap to [-π, π]
    const a = Math.abs(w);
    if (a < bestAbs) {
      bestAbs = a;
      bestSlot = slot;
      bestEvent = eventId;
    }
  }
  if (bestSlot < 0 || bestEvent === null) return null;
  const theta = rt.baseAngle[bestSlot];
  const r = rt.baseRadius[bestSlot];
  return {
    eventId: bestEvent,
    slot: bestSlot,
    position: [r * Math.sin(theta), 0, r * Math.cos(theta)],
    rotY: theta,
    spanX: rt.spanX[bestSlot],
    tint: rt.colorHex[bestSlot] ?? STUDIOLO.parchment,
  };
}

// ── The frame loop — ONE useFrame, allocation-free on the idle/animation path ─
function stepFrame(
  sys: TabletSystem,
  delta: number,
  dialGroup: THREE.Group | null,
  heroRef: MutableRefObject<THREE.Mesh | null>,
  heroSlotRef: MutableRefObject<number>,
  setHero: (h: HeroDesc | null) => void,
  heroEventRef: MutableRefObject<string | null>,
  invalidate: () => void,
): void {
  const rt = sys.tab;
  const bd = sys.band;
  const dt = Math.min(delta, 0.1);

  // Clock advances on ANY demanded frame — the imminent breath rides it.
  let clock = tabletUniforms.uMeridianTime.value + dt;
  if (clock > CLOCK_WRAP) clock -= CLOCK_WRAP;
  tabletUniforms.uMeridianTime.value = clock;

  // Dial rotation: pure time projection, EVERY demanded frame (cheap). No
  // self-invalidate — the minute clock (provider) drives the idle 1-frame/min.
  const nowMs = Date.now();
  const scrub = meridianBus.getScrubOffsetMs();
  const rotationY = ringRotationFor(nowMs, scrub, rt.tz);
  if (dialGroup !== null) dialGroup.rotation.y = rotationY;

  const centerMs = nowMs + scrub;
  const wall =
    typeof performance !== "undefined" ? performance.now() : Date.now();

  // Window roll / data change → full reconcile (throttled during fast scrub).
  const centerMoved =
    Math.abs(centerMs - rt.lastCenterMs) > RECONCILE_CENTER_EPS_MS;
  let heroDirty = false;
  if (
    rt.resync ||
    (centerMoved && wall - rt.lastReconcileWall >= RECONCILE_WALL_THROTTLE_MS)
  ) {
    reconcile(sys, nowMs, centerMs);
    rt.resync = false;
    rt.pendingAdded.clear();
    rt.lastCenterMs = centerMs;
    rt.lastClassifyMs = nowMs;
    rt.lastReconcileWall = wall;
    heroDirty = true;
  } else if (Math.abs(nowMs - rt.lastClassifyMs) > CLASSIFY_EPS_MS) {
    if (reclassify(sys, nowMs)) heroDirty = true;
    rt.lastClassifyMs = nowMs;
    heroDirty = true; // zenith crossing depends on rotation too
  }

  // Hero swap (zenith current|imminent). Recompute on reconcile/classify; flip
  // React state only when the chosen event changes (rare, interaction cadence).
  if (heroDirty) {
    const hero = computeHero(sys, rotationY);
    const nextId = hero?.eventId ?? null;
    if (nextId !== heroEventRef.current) {
      // Un-hide the previous hero's instance.
      const prevSlot = heroSlotRef.current;
      if (prevSlot >= 0 && rt.alive[prevSlot] === 1) {
        rt.hidden[prevSlot] = 0;
        writeTabletMatrix(sys, prevSlot);
        sys.tabletMesh.instanceMatrix.needsUpdate = true;
      }
      heroEventRef.current = nextId;
      heroSlotRef.current = hero?.slot ?? -1;
      if (hero !== null) {
        rt.hidden[hero.slot] = 1;
        writeTabletMatrix(sys, hero.slot);
        sys.tabletMesh.instanceMatrix.needsUpdate = true;
      }
      setHero(hero);
    }
  }

  // ── Animation sweep (allocation-free) ──────────────────────────────────────
  const reduced = rt.reduced;
  let stillMoving = false;
  let matrixDirty = false;
  let colorDirty = false;

  for (let s = 0; s < rt.highWater; s++) {
    if (rt.alive[s] === 0) continue;

    let moved = false;

    // Scale spring (enter 0→1, leave 1→0).
    if (!reduced) {
      const ns = THREE.MathUtils.damp(rt.scale[s], rt.scaleTarget[s], SPRING_LAMBDA, dt);
      if (Math.abs(ns - rt.scale[s]) > 1e-5) {
        rt.scale[s] = ns;
        moved = true;
      }
    } else {
      rt.scale[s] = rt.scaleTarget[s];
    }

    // Leave completion → free the slot.
    if (rt.scaleTarget[s] === 0 && rt.scale[s] < 0.01) {
      // find + drop the leaving key for this slot
      for (const [eid, sl] of rt.leaving) {
        if (sl === s) {
          rt.leaving.delete(eid);
          break;
        }
      }
      freeTabletSlot(sys, s);
      matrixDirty = true;
      continue;
    }

    // Lean spring (toll lean-down / ease-back).
    if (!reduced) {
      const nl = THREE.MathUtils.damp(rt.lean[s], rt.leanTarget[s], LEAN_LAMBDA, dt);
      if (Math.abs(nl - rt.lean[s]) > 1e-5) {
        rt.lean[s] = nl;
        moved = true;
      }
    } else {
      rt.lean[s] = 0;
    }

    // Hover spring (2° lean + brightness lift).
    if (!reduced) {
      const nh = THREE.MathUtils.damp(rt.hoverAmt[s], rt.hoverTarget[s], 1 / HOVER_SMOOTH, dt);
      if (Math.abs(nh - rt.hoverAmt[s]) > 1e-4) {
        rt.hoverAmt[s] = nh;
        moved = true;
        colorDirty = true;
      }
    } else {
      rt.hoverAmt[s] = 0;
    }

    // Pop decay (rivet-in).
    if (rt.pop[s] > 1.0001) {
      const np = THREE.MathUtils.damp(rt.pop[s], 1, POP_LAMBDA, dt);
      rt.pop[s] = Math.abs(np - 1) < 0.01 ? 1 : np;
      colorDirty = true;
      if (rt.pop[s] > 1) moved = true;
    }

    if (moved) {
      if (rt.hidden[s] === 0) writeTabletMatrix(sys, s);
      writeTabletColor(sys, s);
      matrixDirty = true;
      stillMoving = true;
    }
  }

  // Band scale springs.
  for (let s = 0; s < bd.highWater; s++) {
    if (bd.alive[s] === 0) continue;
    if (reduced) {
      bd.scale[s] = bd.scaleTarget[s];
    } else {
      const ns = THREE.MathUtils.damp(bd.scale[s], bd.scaleTarget[s], SPRING_LAMBDA, dt);
      if (Math.abs(ns - bd.scale[s]) > 1e-5) {
        bd.scale[s] = ns;
        writeBandMatrix(sys, s);
        matrixDirty = true;
        stillMoving = true;
      }
    }
    if (bd.scaleTarget[s] === 0 && bd.scale[s] < 0.01) {
      for (const [eid, sl] of bd.leaving) {
        if (sl === s) {
          bd.leaving.delete(eid);
          break;
        }
      }
      freeBandSlot(sys, s);
      matrixDirty = true;
    }
  }

  // Hero lean tracks its instance's lean each animating frame.
  if (heroRef.current !== null && heroSlotRef.current >= 0) {
    const hs = heroSlotRef.current;
    heroRef.current.rotation.set(rt.lean[hs] + HOVER_LEAN * rt.hoverAmt[hs], rt.baseAngle[hs], 0, "YXZ");
  }

  if (matrixDirty) {
    sys.tabletMesh.instanceMatrix.needsUpdate = true;
    sys.bandMesh.instanceMatrix.needsUpdate = true;
  }
  if (colorDirty && sys.tabletMesh.instanceColor !== null) {
    sys.tabletMesh.instanceColor.needsUpdate = true;
  }

  rt.motion = stillMoving;
  if (stillMoving) invalidate();
}

/**
 * The whole event-tablet layer: two InstancedMeshes + one hero-glass swap, ONE
 * frame loop. Consumes `useWorldData().meridian` + `worldEvents`. Produces two
 * base draw calls (+1 hero +1 transmission pass); renders only on data change,
 * scrub, the minute tick, or an active spring — never per-row React churn.
 */
export function EventTablets(): JSX.Element {
  const invalidate = useThree((s) => s.invalidate);
  const { tree, meridian } = useWorldData();
  // M-12 honesty: no tablets over a disconnected/expired sky. Feed the solver an
  // EMPTY event set whenever `status !== "connected"` so any resident tablets
  // leave (spring-out, or instant under reduced motion) — the ring goes dark and
  // wordless regardless of a stale event cache. An empty-but-connected day is
  // still `connected`, so it just yields zero slots naturally (same result, no
  // caption). Never gated on event count — only on the honest status.
  const connected = meridian.status === "connected";

  const sys = useMemo(() => buildSystem(), []);
  const dialRef = useRef<THREE.Group | null>(null);
  const heroRef = useRef<THREE.Mesh | null>(null);
  const heroSlotRef = useRef<number>(-1);
  const heroEventRef = useRef<string | null>(null);
  const hoveredSlotRef = useRef<number>(-1);
  const [hero, setHero] = useState<HeroDesc | null>(null);

  // Solve the dial layout on data identity change (never per-frame). When the
  // sky is not connected we solve over NO events (M-12) — the honest dark ring.
  const solved = useMemo(
    () =>
      solveMeridianLayout(
        connected ? meridian.events : [],
        tree,
        meridian.calendars,
        meridian.timezone,
      ),
    [connected, meridian.events, meridian.calendars, meridian.timezone, tree],
  );

  // Track the previous event map so a genuinely-new (Jarvis-riveted) event pops.
  const prevEventsRef = useRef<Map<string, GcalEventDTO>>(new Map());

  // Dispose per-mount GPU resources on unmount (never the shared geometry).
  useEffect(() => {
    return () => {
      sys.tabletMesh.dispose();
      sys.bandMesh.dispose();
      sys.tabletMaterial.dispose();
      sys.bandMaterial.dispose();
      _tabletPickMap.clear();
      tabletHoverBus.set(null);
    };
  }, [sys]);

  // Data-change sync: stash solved slots + tz, flag a resync, mark rivet-ins.
  useEffect(() => {
    const diff = diffEventSnapshots(prevEventsRef.current, meridian.events);
    const nextMap = new Map<string, GcalEventDTO>();
    for (const e of meridian.events) nextMap.set(e.id, e);
    prevEventsRef.current = nextMap;

    const rt = sys.tab;
    rt.slots = solved.slots;
    rt.byEvent = solved.byEvent;
    rt.tz = meridian.timezone;
    rt.reduced = worldPrefersReducedMotion();
    for (const id of diff.added) rt.pendingAdded.add(id);
    rt.resync = true;
    invalidate();
  }, [sys, solved, meridian.events, meridian.timezone, invalidate]);

  // T-15 lean-down: the matching tablet (or hero) springs toward the dais.
  useEffect(() => {
    return worldEvents.on("meridian-toll", ({ eventId }) => {
      const rt = sys.tab;
      if (worldPrefersReducedMotion()) return; // reduced motion: no lean
      rt.tollActive.add(eventId);
      const slot = rt.index.get(eventId);
      if (slot !== undefined) {
        rt.leanTarget[slot] = TABLET_VISUALS.imminent.leanRad;
        rt.motion = true;
        invalidate();
      }
    });
  }, [sys, invalidate]);

  useFrame((_, delta) =>
    stepFrame(
      sys,
      delta,
      dialRef.current,
      heroRef,
      heroSlotRef,
      setHero,
      heroEventRef,
      invalidate,
    ),
  );

  // ── Hover / pick handlers (the U-07 convention, vectorized per instance) ────
  const onPointerMove = (e: ThreeEvent<PointerEvent>): void => {
    const id = e.instanceId;
    if (id === undefined) return;
    e.stopPropagation();
    if (hoveredSlotRef.current === id) return;
    const rt = sys.tab;
    // clear the previously-hovered tablet
    const prev = hoveredSlotRef.current;
    if (prev >= 0) rt.hoverTarget[prev] = 0;
    hoveredSlotRef.current = id;
    rt.hoverTarget[id] = 1;
    if (typeof document !== "undefined") document.body.style.cursor = "pointer";
    tabletHoverBus.set(_tabletPickMap.get(id) ?? null);
    rt.motion = true;
    invalidate();
  };

  const onPointerOut = (): void => {
    const rt = sys.tab;
    const prev = hoveredSlotRef.current;
    if (prev >= 0) rt.hoverTarget[prev] = 0;
    hoveredSlotRef.current = -1;
    if (typeof document !== "undefined") document.body.style.cursor = "";
    tabletHoverBus.set(null);
    rt.motion = true;
    invalidate();
  };

  const onClick = (e: ThreeEvent<MouseEvent>): void => {
    const id = e.instanceId;
    if (id === undefined) return;
    const eventId = _tabletPickMap.get(id);
    if (eventId === undefined) return;
    e.stopPropagation();
    // Push the chain in one handler (mirrors Lanterns): frame the ring, then
    // drill to the tablet. React 19 batches → CameraRig re-renders once → one glide.
    focusStack.push({ kind: "ring" });
    focusStack.push({ kind: "ring", eventId });
  };

  return (
    <group
      position={[0, RING_HEIGHT, 0]}
      rotation={[-RING_CANT, 0, 0]}
      name="event-tablets-rig"
    >
      <group ref={dialRef}>
        <primitive
          object={sys.tabletMesh}
          onPointerMove={onPointerMove}
          onPointerOut={onPointerOut}
          onClick={onClick}
        />
        <primitive object={sys.bandMesh} />
        {hero !== null ? (
          <mesh
            ref={heroRef}
            position={hero.position}
            rotation={[0, hero.rotY, 0]}
            scale={[hero.spanX, 1, 1]}
            geometry={TABLET_GEOMETRY}
            frustumCulled={false}
            userData={{ eventId: hero.eventId }}
          >
            {heroGlass({ tint: hero.tint })}
          </mesh>
        ) : null}
      </group>
    </group>
  );
}

export default EventTablets;
