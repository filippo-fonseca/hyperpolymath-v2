"use client";

/**
 * Fireflies.tsx — U-14 · The Studiolo · firefly-system
 *
 * Every UNFILED capture (no linked project) is a living firefly. All of them
 * live in ONE `THREE.InstancedMesh` (cap 256) with additive glow → exactly ONE
 * draw call for the whole capture layer (PLAN §7.2). Nothing here is a per-row
 * React node — drei `<Instances>` is rejected (the never-mount-per-row rule).
 *
 * Three behaviors, one runtime, zero React state per frame:
 *   - DRIFT — a wandering swarm loitering near the trunk (count = inbox pressure).
 *   - FLIGHT — the scripted `fireflyBus.fly()` along the correct bough to a
 *     lantern (the visual proof of the core product promise).
 *   - LANDING/COOL — arrive, two-note chime, dissolve cyan→candle-gold, and hand
 *     the stage to the real ember's spring-in (positional coincidence, §8).
 *
 * The runtime is a hand-rolled SoA freelist (typed arrays, module scratch):
 *   - `useWorldData()` is read in RENDER, never per-frame.
 *   - Reconciliation runs in a `useEffect` keyed on `captures` (§4).
 *   - ONE allocation-free `useFrame` drifts, flies, dissolves, and decides demand.
 *
 * DEMAND POLICY (three tiers, §6): 60 fps while any flight/spring is unsettled or
 * inside the 4 s post-interaction window; a ≤5 fps `setInterval` heartbeat while a
 * swarm exists and the tab is visible; TRUE SLEEP (no interval, no rAF) when there
 * are zero fireflies. `prefers-reduced-motion` collapses to a static swarm with no
 * heartbeat and instant-resolve flights (§10).
 *
 * `fireflyBus` is a module singleton implementing the FROZEN `FireflyBus`
 * contract (diffing.ts:161-163). U-16 imports it directly and only ever CALLS
 * `fly()`; this unit initiates nothing. The mounted component mirrors what the bus
 * needs into module refs (the U-09 `emberUniforms` pattern) so the seam stays
 * exact without a conflicting implementation.
 */

import { useEffect, useMemo, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import type { Vector3Tuple } from "three";
import { easing } from "maath";

import { FIREFLY_GEOMETRY } from "../materials/sharedGeometries";
import { STUDIOLO } from "../materials/tokens";
import {
  boughPoint,
  hash01,
  type BoughLayout,
  type TreeLayoutResult,
} from "../data/treeLayout";
import { useWorldData } from "../data/useWorldData";
import {
  worldEvents,
  type FireflyBus,
  type FlightRequest,
} from "../data/diffing";
import type { CaptureWithLinks } from "@/lib/db/queries/captures";

// ── Caps + constants (§3) ────────────────────────────────────────────────────
const MAX_FIREFLIES = 256; // brief amendment over PLAN's sketched 64 (§2.4)
const FLIGHT_POOL = 4; // ≥ U-16's "at most 2 concurrent flights" (PLAN §6 U-16)

// Swarm volume — an annulus around the trunk, clear of the trunk-shell ember
// cluster (radius 0.6, y 1.2–2.0; treeLayout.ts:37-38).
const SWARM_R_MIN = 0.9;
const SWARM_R_MAX = 1.6;
const SWARM_Y_MIN = 1.4;
const SWARM_Y_MAX = 2.8;

// Wander.
const RETARGET_MIN_S = 2.0;
const RETARGET_MAX_S = 4.0;
const WANDER_SMOOTH = 0.9; // maath damp3 smoothTime (s)
const DT_CAP = 0.25; // 200 ms heartbeat frames must integrate as a full step (§6.2)

// Enter/leave/pop springs.
const SPRING_LAMBDA = 12;
const POP_LAMBDA = 6;
const ENTER_POP = 2.0;
const FLIGHT_SPRING_LAMBDA = 25; // transient body visible within ~120 ms (§7.2)

// Glow.
const HDR_MULT = 1.8; // trips Bloom (luminanceThreshold 1) → cyan halo (§2.2)
const COOL_HDR = 1.2; // dissolve target: below threshold → bloom fades off
const FLICKER_AMP = 0.25; // ±25% brightness sinusoid
const FLICKER_HZ_MIN = 0.5;
const FLICKER_HZ_MAX = 1.1;

// Flight timeline (ms) (§7.5).
const DEPART_MS = 250;
const TRAVERSE_MS = 900;
const LAND_MS = 200;
const DISSOLVE_MS = 280;
const T_DEPART_END = DEPART_MS; // 250
const T_TRAVERSE_END = DEPART_MS + TRAVERSE_MS; // 1150
const T_LAND_END = T_TRAVERSE_END + LAND_MS; // 1350 — arrival instant
const T_DISSOLVE_END = T_LAND_END + DISSOLVE_MS; // 1630
const SPEED_PULSE_A = 0.5; // s(u)=u−(A/2π)sin(2πu) → 1.5× mid-arc speed (§7.5)
const FLIGHT_LIFT = 0.08; // skim ABOVE the limb tube, never intersect it

// Idle policy (§6).
const ACTIVE_MS = 4000;
const HEARTBEAT_MS = 200;
const CLOCK_WRAP = 600; // seconds; phase-invisible wrap for the flicker clock

// ── Module scratch — the ONLY vector/color objects the loop touches ──────────
const _dummy = new THREE.Object3D();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _color = new THREE.Color();
const WHITE = new THREE.Color(1, 1, 1);
// `new THREE.Color(hex)` converts sRGB→linear under r185 color management, so
// these are LINEAR values (correct for instanceColor, mirrors Embers.tsx:88-96).
const CYAN = new THREE.Color(STUDIOLO.fireflyCyan);
const COOL = new THREE.Color(STUDIOLO.candleflame);

// ── Types (§12) ──────────────────────────────────────────────────────────────
type FireflyMode = 0 | 1 | 2; // drifting | flying | dissolving

interface FlightEntry {
  slot: number; // -1 = inactive
  captureId: string | null; // null = transient (no backing row)
  bough: BoughLayout | null;
  tLand: number; // curve parameter of the landing (§7.4)
  target: THREE.Vector3; // final landing position (preallocated per entry)
  departFrom: THREE.Vector3; // wander position at fly() (preallocated)
  t: number; // ms since flight start
  resolve: (() => void) | null; // the fly() promise; fired ONCE at landing
}

interface FireflyRuntime {
  index: Map<string, number>; // captureId → slot (resident, unconsumed)
  free: number[]; // freelist stack, seeded [255..0]
  consumed: Set<string>; // captureIds owned by an active flight (§7.7)
  leaving: Map<string, number>; // captureId → slot, spring-out in progress
  slotCapture: (string | null)[]; // slot → captureId (reverse lookup on free)
  flights: FlightEntry[]; // fixed pool, length FLIGHT_POOL
  flightCount: number;
  alive: Uint8Array; // slot occupied
  mode: Uint8Array; // FireflyMode per slot
  pos: Float32Array; // 3× — current position (authoritative, drift only)
  goal: Float32Array; // 3× — wander goal (drift mode only)
  nextPickAt: Float32Array; // clock seconds for next goal re-pick
  seed: Uint32Array; // per-slot LCG state (§5.2)
  phase: Float32Array; // flicker phase, hash01(id)·2π, set once
  flickerHz: Float32Array; // per-slot flicker rate, set once
  scale: Float32Array;
  scaleTarget: Float32Array;
  pop: Float32Array; // HDR pop multiplier, decays → 1
  hue: Float32Array; // 3× — linear RGB (cyan; lerps to candleflame in dissolve)
  highWater: number;
  liveCount: number; // alive slots (drives the heartbeat gate)
  motion: boolean; // springs/pops/dissolves/flights unsettled (demand flag)
  clock: number; // seconds, advanced by capped dt; wraps at CLOCK_WRAP
  reducedMotion: boolean;
  activeUntil: number; // performance.now() horizon of the 4 s wake window
  heartbeatId: number | null;
}

interface FireflySystem {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshBasicMaterial;
  runtime: FireflyRuntime;
}

// ── Module mirrors for the bus (set on mount, nulled on unmount; §7.1) ────────
let _sys: FireflySystem | null = null;
let _layout: TreeLayoutResult | null = null;
let _invalidate: (() => void) | null = null;
let _wake: (() => void) | null = null;

let warnedCap = false;
function warnCapOnce(): void {
  if (!warnedCap) {
    warnedCap = true;
    console.warn(
      "[studiolo] firefly freelist exhausted (cap 256). Extra captures/flights skipped.",
    );
  }
}

// ── Mount-once construction (§2, §3) ──────────────────────────────────────────
function buildSystem(): FireflySystem {
  const material = new THREE.MeshBasicMaterial({
    color: 0xffffff, // WHITE — hue lives in instanceColor (§2.3)
    toneMapped: false, // HDR instanceColor survives to trip Bloom (threshold 1)
    transparent: true,
    blending: THREE.AdditiveBlending, // overlapping motes accumulate; no sort artifacts
    depthWrite: false,
  });

  const mesh = new THREE.InstancedMesh(FIREFLY_GEOMETRY, material, MAX_FIREFLIES);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false; // flights traverse the whole tree (§2.3)
  mesh.name = "fireflies";

  // Eagerly allocate instanceColor + a scale-0 matrix for every slot so the
  // buffers exist at first compile (mirrors Embers.tsx:294-307).
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  for (let i = 0; i < MAX_FIREFLIES; i++) {
    mesh.setMatrixAt(i, _dummy.matrix);
    mesh.setColorAt(i, WHITE);
  }
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) {
    mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor.needsUpdate = true;
  }

  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const runtime: FireflyRuntime = {
    index: new Map(),
    free: [],
    consumed: new Set(),
    leaving: new Map(),
    slotCapture: new Array<string | null>(MAX_FIREFLIES).fill(null),
    flights: Array.from({ length: FLIGHT_POOL }, () => ({
      slot: -1,
      captureId: null,
      bough: null,
      tLand: 0,
      target: new THREE.Vector3(),
      departFrom: new THREE.Vector3(),
      t: 0,
      resolve: null,
    })),
    flightCount: 0,
    alive: new Uint8Array(MAX_FIREFLIES),
    mode: new Uint8Array(MAX_FIREFLIES),
    pos: new Float32Array(MAX_FIREFLIES * 3),
    goal: new Float32Array(MAX_FIREFLIES * 3),
    nextPickAt: new Float32Array(MAX_FIREFLIES),
    seed: new Uint32Array(MAX_FIREFLIES),
    phase: new Float32Array(MAX_FIREFLIES),
    flickerHz: new Float32Array(MAX_FIREFLIES),
    scale: new Float32Array(MAX_FIREFLIES),
    scaleTarget: new Float32Array(MAX_FIREFLIES),
    pop: new Float32Array(MAX_FIREFLIES),
    hue: new Float32Array(MAX_FIREFLIES * 3),
    highWater: 0,
    liveCount: 0,
    motion: false,
    clock: 0,
    reducedMotion,
    activeUntil: 0,
    heartbeatId: null,
  };
  // Freelist seeded so pop() hands out 0, 1, 2, … (keeps highWater tight).
  for (let i = MAX_FIREFLIES - 1; i >= 0; i--) runtime.free.push(i);

  return { mesh, material, runtime };
}

// ── Membership predicate (§1.2) ───────────────────────────────────────────────
function isFirefly(c: CaptureWithLinks): boolean {
  return c.projects.length === 0;
}

// ── Deterministic spawn position (cylindrical, from hash01; §4) ───────────────
function seedSpawnPos(id: string, out: Float32Array, o: number): void {
  const theta = 2 * Math.PI * hash01(id);
  const r = SWARM_R_MIN + (SWARM_R_MAX - SWARM_R_MIN) * hash01(`${id}:r`);
  const y = SWARM_Y_MIN + (SWARM_Y_MAX - SWARM_Y_MIN) * hash01(`${id}:y`);
  out[o] = r * Math.cos(theta);
  out[o + 1] = y;
  out[o + 2] = r * Math.sin(theta);
}

// Module scratch for the exported spawn-point wrapper (§8.2 · U-16 seam).
const _spawnScratch = new Float32Array(3);

/**
 * The deterministic swarm spawn point for a capture id (§8.2 · U-16 seam).
 *
 * A thin exported wrapper over the private `seedSpawnPos` — EXACT reuse, no
 * duplicated swarm constants. U-16's light-thread ends here for an unfiled
 * capture so the thread tip and U-14's cork-pop coincide spatially (§8).
 */
export function captureSpawnPosition(id: string): Vector3Tuple {
  seedSpawnPos(id, _spawnScratch, 0);
  return [_spawnScratch[0]!, _spawnScratch[1]!, _spawnScratch[2]!];
}

// ── Allocation-free seeded randomness — per-slot LCG (§5.2) ────────────────────
function lcg(rt: FireflyRuntime, s: number): number {
  const next = (rt.seed[s]! * 1664525 + 1013904223) >>> 0;
  rt.seed[s] = next;
  return next / 4294967296;
}

// Pick a new wander goal inside the swarm volume (three LCG draws; §5.1).
function pickGoal(rt: FireflyRuntime, s: number): void {
  const theta = 2 * Math.PI * lcg(rt, s);
  const r = SWARM_R_MIN + (SWARM_R_MAX - SWARM_R_MIN) * lcg(rt, s);
  const y = SWARM_Y_MIN + (SWARM_Y_MAX - SWARM_Y_MIN) * lcg(rt, s);
  const o = s * 3;
  rt.goal[o] = r * Math.cos(theta);
  rt.goal[o + 1] = y;
  rt.goal[o + 2] = r * Math.sin(theta);
}

// Write instanceColor = hue × brightness (linear; §2.3).
function writeColor(sys: FireflySystem, slot: number, brightness: number): void {
  const b = slot * 3;
  const h = sys.runtime.hue;
  _color.setRGB(
    h[b]! * brightness,
    h[b + 1]! * brightness,
    h[b + 2]! * brightness,
    THREE.LinearSRGBColorSpace,
  );
  sys.mesh.setColorAt(slot, _color);
}

// Release a slot: scale-0 matrix, reset hue to cyan, clean id maps, freelist.
function freeSlot(sys: FireflySystem, slot: number): void {
  const rt = sys.runtime;
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  sys.mesh.setMatrixAt(slot, _dummy.matrix);
  rt.alive[slot] = 0;
  rt.mode[slot] = 0;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 0;
  rt.pop[slot] = 1;
  const cid = rt.slotCapture[slot];
  if (cid !== null) {
    rt.consumed.delete(cid);
    rt.leaving.delete(cid);
    if (rt.index.get(cid) === slot) rt.index.delete(cid);
    rt.slotCapture[slot] = null;
  }
  const b = slot * 3;
  rt.hue[b] = CYAN.r;
  rt.hue[b + 1] = CYAN.g;
  rt.hue[b + 2] = CYAN.b;
  rt.free.push(slot);
  rt.liveCount--;
}

// Seed a fresh drifting firefly at its deterministic spawn (§4.2).
function spawnFirefly(sys: FireflySystem, slot: number, id: string): void {
  const rt = sys.runtime;
  rt.alive[slot] = 1;
  rt.mode[slot] = 0;
  if (slot + 1 > rt.highWater) rt.highWater = slot + 1;
  const o = slot * 3;
  seedSpawnPos(id, rt.pos, o);
  rt.goal[o] = rt.pos[o]!;
  rt.goal[o + 1] = rt.pos[o + 1]!;
  rt.goal[o + 2] = rt.pos[o + 2]!;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 1;
  rt.pop[slot] = ENTER_POP; // "blinks into being"
  rt.phase[slot] = hash01(id) * Math.PI * 2;
  rt.flickerHz[slot] =
    FLICKER_HZ_MIN + (FLICKER_HZ_MAX - FLICKER_HZ_MIN) * hash01(`${id}:f`);
  rt.seed[slot] = (hash01(id) * 4294967296) >>> 0;
  rt.nextPickAt[slot] = rt.clock; // re-pick immediately on first frame
  const b = slot * 3;
  rt.hue[b] = CYAN.r;
  rt.hue[b + 1] = CYAN.g;
  rt.hue[b + 2] = CYAN.b;
  rt.slotCapture[slot] = id;
  rt.liveCount++;
  writeColor(sys, slot, HDR_MULT * ENTER_POP);
  _dummy.position.fromArray(rt.pos, o);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  sys.mesh.setMatrixAt(slot, _dummy.matrix);
}

// ── Reconcile — useEffect([sys, captures]) (§4) ───────────────────────────────
function reconcile(sys: FireflySystem, captures: CaptureWithLinks[]): void {
  const rt = sys.runtime;

  const next = new Set<string>();
  for (const c of captures) if (isFirefly(c)) next.add(c.id);

  let colorDirty = false;

  // 1. Removals — id resident but gone/newly-filed in next.
  for (const [id, slot] of Array.from(rt.index)) {
    if (next.has(id)) continue;
    if (rt.consumed.has(id)) {
      // An active flight owns this instance and retires it itself (§4.1).
      rt.index.delete(id);
      continue;
    }
    rt.index.delete(id);
    rt.leaving.set(id, slot);
    rt.scaleTarget[slot] = 0; // the frame loop frees it when scale < 0.01
  }

  // 2. Additions (+ re-adds mid-leave reclaim the same slot).
  for (const id of next) {
    if (rt.index.has(id)) continue; // resident
    if (rt.consumed.has(id)) continue; // owned by an active flight

    const leavingSlot = rt.leaving.get(id);
    if (leavingSlot !== undefined) {
      rt.leaving.delete(id);
      rt.index.set(id, leavingSlot);
      rt.mode[leavingSlot] = 0;
      rt.scaleTarget[leavingSlot] = 1;
      rt.slotCapture[leavingSlot] = id;
      const b = leavingSlot * 3;
      rt.hue[b] = CYAN.r;
      rt.hue[b + 1] = CYAN.g;
      rt.hue[b + 2] = CYAN.b;
      continue;
    }

    const slot = rt.free.pop();
    if (slot === undefined) {
      warnCapOnce();
      continue;
    }
    rt.index.set(id, slot);
    spawnFirefly(sys, slot, id);
    colorDirty = true;
  }

  rt.motion = true;
  sys.mesh.instanceMatrix.needsUpdate = true;
  if (colorDirty && sys.mesh.instanceColor !== null) {
    sys.mesh.instanceColor.needsUpdate = true;
  }
}

// ── Destination: recover the landing curve parameter numerically (§7.4) ───────
function findLanternT(bough: BoughLayout, target: THREE.Vector3): number {
  let bestT = 0;
  let bestD = Infinity;
  for (let k = 0; k <= 32; k++) {
    const t = k / 32;
    const p = boughPoint(bough, t);
    const dx = p[0] - target.x;
    const dy = p[1] - target.y;
    const dz = p[2] - target.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  const lo = Math.max(0, bestT - 1 / 32);
  const hi = Math.min(1, bestT + 1 / 32);
  for (let k = 0; k <= 8; k++) {
    const t = lo + ((hi - lo) * k) / 8;
    const p = boughPoint(bough, t);
    const dx = p[0] - target.x;
    const dy = p[1] - target.y;
    const dz = p[2] - target.z;
    const d = dx * dx + dy * dy + dz * dz;
    if (d < bestD) {
      bestD = d;
      bestT = t;
    }
  }
  return bestT;
}

// Spawn a transient (no backing row) at the bough root for a fly() with no
// resident instance (§7.2).
function spawnTransient(
  sys: FireflySystem,
  slot: number,
  bough: BoughLayout,
  jitterId: string,
): void {
  const rt = sys.runtime;
  rt.alive[slot] = 1;
  rt.mode[slot] = 1;
  if (slot + 1 > rt.highWater) rt.highWater = slot + 1;
  const o = slot * 3;
  const bs = bough.start;
  rt.pos[o] = bs[0] + (hash01(`${jitterId}:jx`) - 0.5) * 0.1;
  rt.pos[o + 1] = bs[1] + (hash01(`${jitterId}:jy`) - 0.5) * 0.1;
  rt.pos[o + 2] = bs[2] + (hash01(`${jitterId}:jz`) - 0.5) * 0.1;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 1;
  rt.pop[slot] = 1;
  const b = slot * 3;
  rt.hue[b] = CYAN.r;
  rt.hue[b + 1] = CYAN.g;
  rt.hue[b + 2] = CYAN.b;
  rt.slotCapture[slot] = null;
  rt.liveCount++;
}

// Finish a flight instantly (pool overflow / unmount): chime, resolve, retire.
function finishFlightInstant(sys: FireflySystem, e: FlightEntry): void {
  worldEvents.emit("chime", { kind: "two-note" });
  if (e.resolve !== null) {
    const r = e.resolve;
    e.resolve = null;
    r();
  }
  if (e.slot >= 0) freeSlot(sys, e.slot);
  e.slot = -1;
  e.bough = null;
  e.captureId = null;
}

// ── beginFlight — acquire instance + entry, resolve destination (§7.2–§7.4) ───
function beginFlight(
  sys: FireflySystem,
  layout: TreeLayoutResult,
  req: FlightRequest,
  resolve: () => void,
): void {
  const rt = sys.runtime;
  const bough = layout.byArea.get(req.toAreaId);
  if (bough === undefined) {
    resolve();
    return;
  }

  // Acquire the instance: consume a resident, else spawn a transient.
  let slot: number;
  let captureId: string | null = null;
  if (req.captureId !== undefined && rt.index.has(req.captureId)) {
    slot = rt.index.get(req.captureId)!;
    rt.index.delete(req.captureId);
    rt.leaving.delete(req.captureId);
    rt.consumed.add(req.captureId);
    rt.slotCapture[slot] = req.captureId;
    captureId = req.captureId;
    rt.mode[slot] = 1;
  } else {
    const fresh = rt.free.pop();
    if (fresh === undefined) {
      warnCapOnce();
      resolve();
      return;
    }
    slot = fresh;
    spawnTransient(sys, slot, bough, req.captureId ?? req.toAreaId);
  }

  // Reduced motion: no path. Chime, resolve now, crossfade out at position (§10).
  if (rt.reducedMotion) {
    worldEvents.emit("chime", { kind: "two-note" });
    resolve();
    rt.mode[slot] = 0; // hand the scale-out to the drift-loop free path
    rt.scaleTarget[slot] = 0;
    rt.motion = true;
    sys.mesh.instanceMatrix.needsUpdate = true;
    return;
  }

  // Acquire a flight entry; overflow finishes the oldest instantly (§7.3).
  if (rt.flightCount >= FLIGHT_POOL) {
    finishFlightInstant(sys, rt.flights[0]!);
    const last = rt.flights[rt.flightCount - 1]!;
    rt.flights[rt.flightCount - 1] = rt.flights[0]!;
    rt.flights[0] = last;
    rt.flightCount--;
  }
  const entry = rt.flights[rt.flightCount]!;
  entry.slot = slot;
  entry.captureId = captureId;
  entry.bough = bough;
  entry.t = 0;
  entry.resolve = resolve;
  entry.departFrom.fromArray(rt.pos, slot * 3);

  // Destination + landing curve parameter (once, at call time; §7.4).
  let tLand = 0.85;
  if (req.toProjectId !== undefined) {
    const lantern = layout.byProject.get(req.toProjectId);
    if (lantern !== undefined && lantern.areaId === req.toAreaId) {
      entry.target.set(
        lantern.position[0],
        lantern.position[1],
        lantern.position[2],
      );
      tLand = findLanternT(bough, entry.target);
    } else {
      const bp = boughPoint(bough, 0.85);
      entry.target.set(bp[0], bp[1], bp[2]);
    }
  } else {
    const bp = boughPoint(bough, 0.85);
    entry.target.set(bp[0], bp[1], bp[2]);
  }
  entry.tLand = tLand;

  rt.flightCount++;
  rt.mode[slot] = 1;
  rt.motion = true;
  sys.mesh.instanceMatrix.needsUpdate = true;
}

// Advance ONE flight entry; write its matrix + color. Returns true at dissolve
// end (§7.5). `dt` seconds for the fast body spring.
function stepFlight(sys: FireflySystem, e: FlightEntry, dt: number): boolean {
  const rt = sys.runtime;
  const slot = e.slot;
  const bough = e.bough!;
  const t = e.t;

  // Arrival (once): resolve the promise + two-note chime + enter dissolve.
  if (e.resolve !== null && t >= T_LAND_END) {
    worldEvents.emit("chime", { kind: "two-note" });
    const r = e.resolve;
    e.resolve = null;
    r();
    rt.mode[slot] = 2;
  }

  if (t >= T_DISSOLVE_END) return true;

  let px: number;
  let py: number;
  let pz: number;
  let brightness = HDR_MULT;
  let sc: number;

  if (t < T_DEPART_END) {
    // Depart: departFrom → bough.start, easeInQuad (u²) — dive to the limb root.
    const u = t / DEPART_MS;
    const eu = u * u;
    const bs = bough.start;
    px = e.departFrom.x + (bs[0] - e.departFrom.x) * eu;
    py = e.departFrom.y + (bs[1] - e.departFrom.y) * eu;
    pz = e.departFrom.z + (bs[2] - e.departFrom.z) * eu;
  } else if (t < T_TRAVERSE_END) {
    // Traverse: curve param ct = tLand·s(u), s(u)=u−(A/2π)sin(2πu) → 1.5× mid-arc.
    const u = (t - DEPART_MS) / TRAVERSE_MS;
    const su = u - (SPEED_PULSE_A / (2 * Math.PI)) * Math.sin(2 * Math.PI * u);
    const bp = boughPoint(bough, e.tLand * su);
    px = bp[0];
    py = bp[1] + FLIGHT_LIFT;
    pz = bp[2];
  } else if (t < T_LAND_END) {
    // Land: hop from the lifted curve point down onto the lantern, easeOutQuad.
    const u = (t - T_TRAVERSE_END) / LAND_MS;
    const eu = 1 - (1 - u) * (1 - u);
    const bp = boughPoint(bough, e.tLand);
    const fx = bp[0];
    const fy = bp[1] + FLIGHT_LIFT;
    const fz = bp[2];
    px = fx + (e.target.x - fx) * eu;
    py = fy + (e.target.y - fy) * eu;
    pz = fz + (e.target.z - fz) * eu;
  } else {
    // Dissolve/cool: scale 1→0 smoothstep while hue lerps cyan→gold, HDR 1.8→1.2.
    const d = (t - T_LAND_END) / DISSOLVE_MS;
    px = e.target.x;
    py = e.target.y;
    pz = e.target.z;
    brightness = HDR_MULT + (COOL_HDR - HDR_MULT) * d;
    const b = slot * 3;
    rt.hue[b] = CYAN.r + (COOL.r - CYAN.r) * d;
    rt.hue[b + 1] = CYAN.g + (COOL.g - CYAN.g) * d;
    rt.hue[b + 2] = CYAN.b + (COOL.b - CYAN.b) * d;
  }

  if (t < T_LAND_END) {
    rt.scale[slot] = THREE.MathUtils.damp(
      rt.scale[slot]!,
      1,
      FLIGHT_SPRING_LAMBDA,
      dt,
    );
    sc = rt.scale[slot]!;
  } else {
    const d = (t - T_LAND_END) / DISSOLVE_MS;
    sc = 1 - d * d * (3 - 2 * d); // smoothstep down
    rt.scale[slot] = sc;
  }

  _dummy.position.set(px, py, pz);
  _dummy.scale.setScalar(sc);
  _dummy.updateMatrix();
  sys.mesh.setMatrixAt(slot, _dummy.matrix);
  writeColor(sys, slot, brightness);
  return false;
}

// ── The frame loop — ONE useFrame, allocation-free (§5–§7) ────────────────────
function stepFrame(
  sys: FireflySystem,
  delta: number,
  invalidate: () => void,
  activeUntil: number,
): void {
  const rt = sys.runtime;
  const dt = Math.min(delta, DT_CAP);
  let clock = rt.clock + dt;
  if (clock > CLOCK_WRAP) clock -= CLOCK_WRAP;
  rt.clock = clock;

  const reduced = rt.reducedMotion;
  const mesh = sys.mesh;
  let matrixDirty = false;
  let colorDirty = false;
  let stillMoving = false; // springs/pops/dissolves only — NOT steady drift (§6)

  // 1. Drift + enter/leave over drifting slots (mode 0 only; flight-owned slots
  //    are advanced in the flight sweep below).
  for (let s = 0; s < rt.highWater; s++) {
    if (rt.alive[s] === 0) continue;
    if (rt.mode[s] !== 0) continue;
    const o = s * 3;

    // Wander (skipped under reduced motion + while springing out).
    let moving = false;
    if (!reduced && rt.scaleTarget[s] !== 0) {
      if (clock >= rt.nextPickAt[s]!) {
        pickGoal(rt, s);
        rt.nextPickAt[s] =
          clock + RETARGET_MIN_S + (RETARGET_MAX_S - RETARGET_MIN_S) * lcg(rt, s);
      }
      _va.fromArray(rt.pos, o);
      _vb.fromArray(rt.goal, o);
      moving = easing.damp3(_va, _vb, WANDER_SMOOTH, dt);
      _va.toArray(rt.pos, o);
    }

    // Scale spring (enter 0→1, leave 1→0).
    const ns = THREE.MathUtils.damp(rt.scale[s]!, rt.scaleTarget[s]!, SPRING_LAMBDA, dt);
    rt.scale[s] = ns;
    const scaleMoving = Math.abs(ns - rt.scaleTarget[s]!) > 1e-4;

    // Pop decay (color ×pop → ×1).
    let popActive = false;
    if (rt.pop[s]! > 1.0001) {
      const np = THREE.MathUtils.damp(rt.pop[s]!, 1, POP_LAMBDA, dt);
      rt.pop[s] = Math.abs(np - 1) < 0.01 ? 1 : np;
      popActive = rt.pop[s]! > 1;
    }

    // Leave completion → free the slot.
    if (rt.scaleTarget[s] === 0 && ns < 0.01) {
      freeSlot(sys, s);
      matrixDirty = true;
      continue;
    }

    // Color: flicker while drifting, else refresh only while popping.
    if (!reduced) {
      const flick =
        1 + FLICKER_AMP * Math.sin(2 * Math.PI * rt.flickerHz[s]! * clock + rt.phase[s]!);
      writeColor(sys, s, HDR_MULT * flick * rt.pop[s]!);
      colorDirty = true;
    } else if (popActive) {
      writeColor(sys, s, HDR_MULT * rt.pop[s]!);
      colorDirty = true;
    }

    if (moving || scaleMoving) {
      _dummy.position.fromArray(rt.pos, o);
      _dummy.scale.setScalar(ns);
      _dummy.updateMatrix();
      mesh.setMatrixAt(s, _dummy.matrix);
      matrixDirty = true;
    }
    if (scaleMoving || popActive) stillMoving = true;
  }

  // 2. Flight sweep (swap-remove finished entries).
  const flights = rt.flights;
  for (let i = 0; i < rt.flightCount; ) {
    const e = flights[i]!;
    e.t += dt * 1000;
    const finished = stepFlight(sys, e, dt);
    matrixDirty = true;
    colorDirty = true;
    if (finished) {
      freeSlot(sys, e.slot);
      e.slot = -1;
      e.bough = null;
      e.captureId = null;
      e.resolve = null;
      const last = flights[rt.flightCount - 1]!;
      flights[rt.flightCount - 1] = flights[i]!;
      flights[i] = last;
      rt.flightCount--;
    } else {
      stillMoving = true;
      i++;
    }
  }

  // 3. Flush dirty flags at most once each.
  if (matrixDirty) mesh.instanceMatrix.needsUpdate = true;
  if (colorDirty && mesh.instanceColor !== null) {
    mesh.instanceColor.needsUpdate = true;
  }

  // 4. Demand decision (§6 tiers). Drift never self-demands when idle: the
  //    heartbeat's ≤5 fps IS the idle drift rate.
  rt.motion = stillMoving;
  if (rt.flightCount > 0 || stillMoving) {
    invalidate(); // tier 1 — flight/spring active → 60 fps
  } else if (performance.now() < activeUntil) {
    invalidate(); // tier 2 — inside the 4 s wake window → 60 fps drift
  }
  // tier 3 idle: return without invalidating (heartbeat drives ≤5 fps drift).
  // tier 4 asleep: liveCount 0 → heartbeat cleared → nothing demands.
}

// ── Heartbeat — idempotent install/clear (§6) ─────────────────────────────────
function syncHeartbeat(sys: FireflySystem, invalidate: () => void): void {
  const rt = sys.runtime;
  const shouldRun =
    rt.liveCount > 0 &&
    !rt.reducedMotion &&
    typeof document !== "undefined" &&
    document.visibilityState === "visible";
  if (shouldRun && rt.heartbeatId === null) {
    rt.heartbeatId = window.setInterval(() => invalidate(), HEARTBEAT_MS);
  } else if (!shouldRun && rt.heartbeatId !== null) {
    clearInterval(rt.heartbeatId);
    rt.heartbeatId = null;
  }
}

// ── The bus singleton (FROZEN contract; §7.1) ─────────────────────────────────
export const fireflyBus: FireflyBus = {
  fly(req: FlightRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      const sys = _sys;
      const layout = _layout;
      // Degrade gracefully: never reject, never hang (§7.1).
      if (sys === null || layout === null) {
        console.warn(
          "[studiolo] fireflyBus.fly: world not mounted; resolving no-op.",
        );
        resolve();
        return;
      }
      if (layout.byArea.get(req.toAreaId) === undefined) {
        console.warn(
          `[studiolo] fireflyBus.fly: unknown area "${req.toAreaId}"; resolving no-op.`,
        );
        resolve();
        return;
      }
      _wake?.();
      beginFlight(sys, layout, req, resolve);
      if (_invalidate !== null) {
        syncHeartbeat(sys, _invalidate);
        _invalidate();
      }
    });
  },
};

/**
 * The whole capture layer: ONE InstancedMesh, ONE frame loop. Consumes
 * `useWorldData().captures`/`.layout` and `worldEvents`. Produces exactly one
 * draw call; renders only on data change, the 4 s wake window, the ≤5 fps
 * heartbeat, or an active flight (never per-row React churn).
 */
export function Fireflies(): JSX.Element {
  const invalidate = useThree((s) => s.invalidate);
  const { captures, layout } = useWorldData();

  const sys = useMemo(() => buildSystem(), []);

  // Module mirrors for the bus + dispose on unmount (never the shared geometry).
  useEffect(() => {
    _sys = sys;
    _invalidate = invalidate;
    _wake = () => {
      sys.runtime.activeUntil = performance.now() + ACTIVE_MS;
      invalidate();
    };
    return () => {
      const rt = sys.runtime;
      // Resolve any in-flight promises so U-16 never hangs on a world unmount.
      for (let i = 0; i < rt.flightCount; i++) {
        const e = rt.flights[i]!;
        if (e.resolve !== null) {
          const r = e.resolve;
          e.resolve = null;
          r();
        }
      }
      rt.flightCount = 0;
      if (rt.heartbeatId !== null) {
        clearInterval(rt.heartbeatId);
        rt.heartbeatId = null;
      }
      sys.mesh.dispose();
      sys.material.dispose();
      _sys = null;
      _invalidate = null;
      _wake = null;
    };
  }, [sys, invalidate]);

  // Keep the bus's layout mirror fresh (destination resolution reads it).
  useEffect(() => {
    _layout = layout;
    return () => {
      _layout = null;
    };
  }, [layout]);

  // Reconcile against declarative truth (child effect → runs before the
  // provider's parent `capture-created` emit, §1.3). The only spawn path.
  useEffect(() => {
    reconcile(sys, captures);
    sys.runtime.activeUntil = performance.now() + ACTIVE_MS;
    syncHeartbeat(sys, invalidate);
    invalidate();
  }, [sys, captures, invalidate]);

  // capture-created bridge: chime + pop the already-spawned mote (§9). U-18
  // subscribes to `chime`, not `capture-created` — U-14 is the bridge.
  useEffect(() => {
    return worldEvents.on("capture-created", ({ captureId }) => {
      const rt = sys.runtime;
      const slot = rt.index.get(captureId);
      if (slot === undefined) return; // reconcile skipped it (filed) — stay silent
      worldEvents.emit("chime", { kind: "cork-pop" });
      rt.pop[slot] = ENTER_POP;
      rt.motion = true;
      invalidate();
    });
  }, [sys, invalidate]);

  // Wake window (4 s) + heartbeat visibility gating (§6).
  useEffect(() => {
    const rt = sys.runtime;
    const wake = () => {
      rt.activeUntil = performance.now() + ACTIVE_MS;
      invalidate();
    };
    wake();
    const opts: AddEventListenerOptions = { passive: true };
    window.addEventListener("pointerdown", wake, opts);
    window.addEventListener("pointermove", wake, opts);
    window.addEventListener("keydown", wake, opts);
    window.addEventListener("wheel", wake, opts);
    const onVisibility = () => {
      syncHeartbeat(sys, invalidate);
      if (document.visibilityState === "visible") invalidate();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("pointerdown", wake);
      window.removeEventListener("pointermove", wake);
      window.removeEventListener("keydown", wake);
      window.removeEventListener("wheel", wake);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [sys, invalidate]);

  useFrame((_, delta) => {
    const rt = sys.runtime;
    const before = rt.liveCount;
    stepFrame(sys, delta, invalidate, rt.activeUntil);
    // The loop may have freed the last slot → tear the heartbeat down (§6).
    if (rt.liveCount !== before) syncHeartbeat(sys, invalidate);
  });

  return <primitive object={sys.mesh} />;
}

export default Fireflies;
