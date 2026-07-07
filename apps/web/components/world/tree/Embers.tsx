"use client";

/**
 * Embers.tsx — U-09 · The Studiolo · ember-system (the crown jewel)
 *
 * Every task in the world is an ember; every ember lives in ONE
 * `THREE.InstancedMesh` (cap 1024). Priority filaments (P∞/P1) live in a SECOND
 * `THREE.InstancedMesh` (cap 128). Two meshes ⇒ exactly TWO draw calls for the
 * whole task layer (PLAN §7). Nothing here is a per-row React node — drei
 * `<Instances>` is rejected at this scale (the never-mount-per-row rule).
 *
 * The runtime is a hand-rolled SoA freelist (typed arrays, module-level scratch)
 * mutated imperatively:
 *   - `useWorldData()` is read in RENDER, never per-frame.
 *   - Reconciliation runs in a `useEffect` keyed on data identity (§4).
 *   - ONE allocation-free `useFrame` advances the clock, settles positions,
 *     animates enter/leave, drives ascents, and follows filaments (§5–§7).
 *   - Zero React state per frame; rows NEVER mount/unmount.
 *
 * The state→light grammar is GPU-side (`injectEmberChunk`, §2): a per-instance
 * `aState` attribute + a shared `uEmberTime` clock select the emissive glow
 * (ambient shimmer / gold pulse / steady alarm / ascending floor). The
 * per-instance HUE rides `instanceColor` (HDR-scaled for the flare/pop). The
 * clock advances only in demanded frames, so pulsing pauses when the world
 * sleeps — intended (PLAN §6/§7.5).
 *
 * TREATY: this unit stacks a SECOND injected chunk onto the hologram material
 * family. Read the frozen chunk-composition contract in `../materials/hologram`
 * (doc comment) before touching the GLSL below. Marker comments
 * `// <studiolo:ember:*>` wrap every chunk; U-03's `// <studiolo:fresnel:*>`
 * blocks coexist untouched (chain order = injection order).
 */

import { useEffect, useMemo, type JSX } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { easing } from "maath";

import {
  makeHologramMaterial,
  chainOnBeforeCompile,
} from "../materials/hologram";
import { EMBER_GEOMETRY, TAPER_GEOMETRY } from "../materials/sharedGeometries";
import { STUDIOLO } from "../materials/tokens";
import {
  EMBER_VISUALS,
  hasFilament,
  filamentScaleY,
  type EmberState,
} from "../data/mappings";
import { hash01, trunkShellPosition, type EmberSlot } from "../data/treeLayout";
import { useWorldData } from "../data/useWorldData";
import { worldEvents, type TaskTransition } from "../data/diffing";

// ── Caps (mirrored nowhere else) ────────────────────────────────────────────
const MAX_EMBERS = 1024;
const MAX_TAPERS = 128;

// State id encoding — FROZEN (hologram.ts:39-40 / EmberState union order).
const STATE_ID: Record<EmberState, number> = {
  ambient: 0,
  today: 1,
  overdue: 2,
  ascending: 3,
};

// The ember grammar, read from the single source (mappings.ts). NEVER re-literal.
const AMB = EMBER_VISUALS.ambient;
const TODAY = EMBER_VISUALS.today;
const OVER = EMBER_VISUALS.overdue;
const ASC = EMBER_VISUALS.ascending;

// Ascent keyframe constants (ms / meters / mult).
const FLARE_MS = ASC.flareMs; // 300
const FLARE_MUL = ASC.flareMul; // 3
const RISE_Y = ASC.riseY; // 6
const RISE_MS = ASC.riseMs; // 2200
const APEX_MS = FLARE_MS + RISE_MS; // 2500
const DISSOLVE_MS = 600; // last 600 ms of the rise
const RISE_HDR_END = 1.2; // HDR mult at apex of the rise (3 → 1.2 linear)
const ASCENT_POOL = 16; // concurrent-ascent pool (far beyond the 3-completion bar)
const SPRING_LAMBDA = 12; // enter/leave scale damp rate (drei/MathUtils convention)
const POP_LAMBDA = 6; // emissive-pop decay rate
const SETTLE_SMOOTH = 0.25; // maath damp3 smoothTime (seconds)
const ENTER_POP = 2.2; // emissive pop on spawn (color × this, decays → 1)
const CLOCK_WRAP = 600; // uEmberTime wrap (phase-invisible, §1.2)

// Per-state hues, precomputed once. `new THREE.Color(hex)` converts sRGB→linear
// under r185 color management, so these are LINEAR values (correct for
// instanceColor, §1.3). `ascending` keeps its from-state hue (flare recolors via
// HDR, not hue), so it has no entry here.
const STATE_COLOR = {
  ambient: new THREE.Color(AMB.color),
  today: new THREE.Color(TODAY.color),
  overdue: new THREE.Color(OVER.color),
} as const;

const WHITE = new THREE.Color(1, 1, 1);

// Dev-only synthetic load (memo §10 step 7). Set NEXT_PUBLIC_STUDIOLO_SEED_EMBERS
// to e.g. 500 to append fake pulsing embers for a manual fps / gl.info check.
// Zero cost in prod and when unset.
const DEV_SEED =
  process.env.NODE_ENV !== "production"
    ? Number(process.env.NEXT_PUBLIC_STUDIOLO_SEED_EMBERS ?? 0) || 0
    : 0;

// ── The GPU clock (module singleton, captured by the compile closure, §1.2) ──
// The SAME object `useFrame` mutates. `injectEmberChunk` wires it into every
// compiled ember program; it survives material re-creation across remounts.
const emberUniforms = { uEmberTime: { value: 0 } };

// ── GLSL chunks (verbatim §2; literals interpolated from EMBER_VISUALS) ──────
const f = (n: number): string => n.toFixed(4);

const VERT_COMMON_ANCHOR = "#include <common>";
const VERT_COMMON_INJECTION = `#include <common>
// <studiolo:ember:vdecl>
attribute vec2 aState;
varying vec2 vEmberState;
// </studiolo:ember:vdecl>`;

const VERT_BEGIN_ANCHOR = "#include <begin_vertex>";
const VERT_BEGIN_INJECTION = `#include <begin_vertex>
// <studiolo:ember:vstate>
vEmberState = aState;
// </studiolo:ember:vstate>`;

const FRAG_COMMON_ANCHOR = "#include <common>";
const FRAG_COMMON_INJECTION = `#include <common>
// <studiolo:ember:fdecl>
varying vec2 vEmberState;
uniform float uEmberTime;
// </studiolo:ember:fdecl>`;

const FRAG_EMISSIVE_ANCHOR = "#include <emissivemap_fragment>";
const FRAG_EMISSIVE_INJECTION = `#include <emissivemap_fragment>
// <studiolo:ember:pulse>
{
  float emState = vEmberState.x;
  float emGlow;
  if ( emState < 0.5 ) {
    // ambient: subtle shimmer
    emGlow = ${f(AMB.emissive)} + 0.08 * sin( 6.2831853 * ${f(AMB.pulseHz)} * uEmberTime + vEmberState.y );
  } else if ( emState < 1.5 ) {
    // today: gold pulse emissiveMin→Max @ pulseHz
    float emWave = 0.5 + 0.5 * sin( 6.2831853 * ${f(TODAY.pulseHz)} * uEmberTime + vEmberState.y );
    emGlow = mix( ${f(TODAY.emissiveMin)}, ${f(TODAY.emissiveMax)}, emWave );
  } else if ( emState < 2.5 ) {
    // overdue: steady alarm, no shimmer
    emGlow = ${f(OVER.emissive)};
  } else {
    // ascending: floor at today's max; the ×3 flare rides instanceColor HDR (§6)
    emGlow = ${f(TODAY.emissiveMax)};
  }
  // vColor.rgb: three.js r185 declares vColor as vec4 under USE_INSTANCING_COLOR;
  // the .rgb swizzle is valid on both vec3/vec4 so the vec3 add always type-checks.
  totalEmissiveRadiance += vColor.rgb * emGlow;
}
// </studiolo:ember:pulse>`;

/**
 * The ONE ember shader decorator. Chained AFTER U-03's fresnel injector via
 * `chainOnBeforeCompile` (base chunks land first). Performs exactly four
 * `#include` replaces (two vertex, two fragment) — each keeps its anchor so a
 * future decorator can still find it (treaty rule 1) — plus the uEmberTime wire.
 */
function injectEmberChunk(
  shader: THREE.WebGLProgramParametersWithUniforms,
): void {
  shader.uniforms.uEmberTime = emberUniforms.uEmberTime;
  shader.vertexShader = shader.vertexShader
    .replace(VERT_COMMON_ANCHOR, VERT_COMMON_INJECTION)
    .replace(VERT_BEGIN_ANCHOR, VERT_BEGIN_INJECTION);
  shader.fragmentShader = shader.fragmentShader
    .replace(FRAG_COMMON_ANCHOR, FRAG_COMMON_INJECTION)
    .replace(FRAG_EMISSIVE_ANCHOR, FRAG_EMISSIVE_INJECTION);
}

// ── Module-level scratch — the ONLY vector/color objects the loop touches ────
const _dummy = new THREE.Object3D();
const _va = new THREE.Vector3();
const _vb = new THREE.Vector3();
const _color = new THREE.Color();

/**
 * FROZEN CONTRACT (U-11 hover caption / U-07 picking, mirrors lanternPickMap).
 * instanceId → taskId for resident/leaving/ascending embers. Maintained by
 * reconcile + the ascent runtime; entries are removed when a slot is freed.
 */
const _emberPickMap = new Map<number, string>();
export const emberPickMap: ReadonlyMap<number, string> = _emberPickMap;

// ── Runtime shape (module-internal, per-mount, NEVER React state, §4.1) ──────
interface AscentEntry {
  slot: number;
  t: number; // ms since trigger
  from: THREE.Vector3; // ascent origin (current animated position)
}

interface EmberRuntime {
  // — PLAN §6 signature —
  index: Map<string, number>; // taskId → slot (resident embers only)
  free: number[]; // freelist stack, seeded [1023..0]
  ascending: AscentEntry[]; // fixed pool; active entries in [0, ascendCount)
  ascendCount: number;
  // — extensions (§4.1) —
  leavingByTask: Map<string, number>; // taskId → slot, spring-out in progress
  alive: Uint8Array; // slot occupied (resident | leaving | ascending)
  pos: Float32Array; // 3× — CURRENT position (authoritative)
  target: Float32Array; // 3× — settle target (basePosition + yOffset)
  scale: Float32Array; // current uniform scale
  scaleTarget: Float32Array; // 1 resident, 0 leaving
  pop: Float32Array; // HDR color multiplier, decays → 1
  baseColor: Float32Array; // 3× — linear RGB of current state hue
  stateId: Uint8Array; // mirrors aState.x (cheap CPU diff)
  highWater: number; // max slot ever allocated + 1 (loop bound)
  motion: boolean; // anything animating? (early-return flag)
  taperDirty: boolean; // filament repack requested (§7)
  // — filament membership (SoA, rebuilt on repack) —
  hasFilamentSlot: Uint8Array; // 1 if this slot's task carries a filament
  filamentScaleYSlot: Float32Array; // per-slot scale.y (2.8 P∞ / 2.2 P1)
  taperParentSlot: Uint16Array; // dense: taper k → parent ember slot
  taperScaleY: Float32Array; // dense: taper k → scale.y
  taperCount: number; // == taperMesh.count
}

interface EmberSystem {
  emberMesh: THREE.InstancedMesh;
  taperMesh: THREE.InstancedMesh;
  emberMaterial: THREE.MeshPhysicalMaterial;
  taperMaterial: THREE.MeshPhysicalMaterial;
  aState: THREE.InstancedBufferAttribute;
  aStateArr: Float32Array;
  runtime: EmberRuntime;
}

let warnedCap = false;
function warnCapOnce(): void {
  if (!warnedCap) {
    warnedCap = true;
    console.warn(
      "[studiolo] ember freelist exhausted (cap 1024). Extra tasks skipped.",
    );
  }
}
let warnedTaper = false;
function warnTaperOnce(): void {
  if (!warnedTaper) {
    warnedTaper = true;
    console.warn(
      "[studiolo] filament cap 128 exceeded; extra P∞/P1 filaments truncated.",
    );
  }
}

// ── Mount-once construction (§3) ─────────────────────────────────────────────
function buildSystem(): EmberSystem {
  _emberPickMap.clear();

  // Material: WHITE body (state hue lives in instanceColor); rim < 1 so bloom
  // belongs to the state grammar, not the fresnel edge (§1.1).
  const emberMaterial = makeHologramMaterial({
    tint: "#ffffff",
    opacity: 0.55,
    rimColor: STUDIOLO.candleflame,
    rimIntensity: 0.9,
  });
  chainOnBeforeCompile(emberMaterial, injectEmberChunk, "ember@1");
  // Mirror the clock for the dev harness (same object useFrame mutates).
  emberMaterial.userData.emberUniforms = emberUniforms;

  // aState attribute on the shared geometry singleton — idempotent (§1.4).
  let aState = EMBER_GEOMETRY.getAttribute("aState") as
    | THREE.InstancedBufferAttribute
    | undefined;
  if (aState === undefined) {
    aState = new THREE.InstancedBufferAttribute(
      new Float32Array(MAX_EMBERS * 2),
      2,
    );
    aState.setUsage(THREE.DynamicDrawUsage);
    EMBER_GEOMETRY.setAttribute("aState", aState);
  }
  const aStateArr = aState.array as Float32Array;

  const emberMesh = new THREE.InstancedMesh(
    EMBER_GEOMETRY,
    emberMaterial,
    MAX_EMBERS,
  );
  emberMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  emberMesh.frustumCulled = false; // instances span the whole tree (§3)
  emberMesh.name = "embers";

  // Every slot starts scale-0 (degenerate) + WHITE so instanceColor exists at
  // first compile (USE_INSTANCING_COLOR → vColor available for the frag chunk).
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  for (let i = 0; i < MAX_EMBERS; i++) {
    emberMesh.setMatrixAt(i, _dummy.matrix);
    emberMesh.setColorAt(i, WHITE);
  }
  emberMesh.instanceMatrix.needsUpdate = true;
  if (emberMesh.instanceColor !== null) {
    emberMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
    emberMesh.instanceColor.needsUpdate = true;
  }

  // Tapers reuse the base fresnel program (no chain → cache key "studiolo:sf@1").
  const taperMaterial = makeHologramMaterial({
    tint: STUDIOLO.candleflame,
    opacity: 0.5,
    emissiveIntensity: 1.4, // body glow > 1 blooms gently
  });
  const taperMesh = new THREE.InstancedMesh(
    TAPER_GEOMETRY,
    taperMaterial,
    MAX_TAPERS,
  );
  taperMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  taperMesh.frustumCulled = false;
  taperMesh.count = 0; // tapers are densely repacked; count IS the draw count
  taperMesh.name = "ember-filaments";

  const runtime: EmberRuntime = {
    index: new Map(),
    free: [],
    ascending: Array.from({ length: ASCENT_POOL }, () => ({
      slot: -1,
      t: 0,
      from: new THREE.Vector3(),
    })),
    ascendCount: 0,
    leavingByTask: new Map(),
    alive: new Uint8Array(MAX_EMBERS),
    pos: new Float32Array(MAX_EMBERS * 3),
    target: new Float32Array(MAX_EMBERS * 3),
    scale: new Float32Array(MAX_EMBERS),
    scaleTarget: new Float32Array(MAX_EMBERS),
    pop: new Float32Array(MAX_EMBERS),
    baseColor: new Float32Array(MAX_EMBERS * 3),
    stateId: new Uint8Array(MAX_EMBERS),
    highWater: 0,
    motion: false,
    taperDirty: false,
    hasFilamentSlot: new Uint8Array(MAX_EMBERS),
    filamentScaleYSlot: new Float32Array(MAX_EMBERS),
    taperParentSlot: new Uint16Array(MAX_TAPERS),
    taperScaleY: new Float32Array(MAX_TAPERS),
    taperCount: 0,
  };
  // Freelist seeded so pop() hands out 0, 1, 2, … (keeps highWater tight).
  for (let i = MAX_EMBERS - 1; i >= 0; i--) runtime.free.push(i);

  return {
    emberMesh,
    taperMesh,
    emberMaterial,
    taperMaterial,
    aState,
    aStateArr,
    runtime,
  };
}

// ── Per-slot writes (§4.2) ───────────────────────────────────────────────────
function stateYOffset(state: EmberState): number {
  return state === "overdue" ? OVER.yOffset : 0; // the CPU-side sag (§2.3)
}

function writeBaseColor(sys: EmberSystem, slot: number, state: EmberState): void {
  const c =
    state === "today"
      ? STATE_COLOR.today
      : state === "overdue"
        ? STATE_COLOR.overdue
        : state === "ambient"
          ? STATE_COLOR.ambient
          : null; // ascending keeps its from-state hue
  if (c === null) return;
  const b = slot * 3;
  sys.runtime.baseColor[b] = c.r;
  sys.runtime.baseColor[b + 1] = c.g;
  sys.runtime.baseColor[b + 2] = c.b;
}

// Write instanceColor = baseColor × mult (linear; setColorAt copies as-is).
function writeInstanceColor(sys: EmberSystem, slot: number, mult: number): void {
  const b = slot * 3;
  const bc = sys.runtime.baseColor;
  _color.setRGB(
    bc[b] * mult,
    bc[b + 1] * mult,
    bc[b + 2] * mult,
    THREE.LinearSRGBColorSpace,
  );
  sys.emberMesh.setColorAt(slot, _color);
}

// stateId + aState.x + hue (+ refresh instanceColor at current pop). Callers
// batch the `needsUpdate` flags.
function applyState(sys: EmberSystem, slot: number, state: EmberState): void {
  const rt = sys.runtime;
  const id = STATE_ID[state];
  rt.stateId[slot] = id;
  sys.aStateArr[slot * 2] = id;
  if (state !== "ascending") writeBaseColor(sys, slot, state);
  writeInstanceColor(sys, slot, rt.pop[slot]);
}

function setTarget(
  sys: EmberSystem,
  slot: number,
  bp: readonly [number, number, number] | THREE.Vector3Tuple,
  state: EmberState,
): void {
  const t = sys.runtime.target;
  const o = slot * 3;
  t[o] = bp[0];
  t[o + 1] = bp[1] + stateYOffset(state);
  t[o + 2] = bp[2];
}

function updateFilamentSlot(
  rt: EmberRuntime,
  slot: number,
  filament: boolean,
  scaleY: number,
): void {
  if (filament) {
    rt.hasFilamentSlot[slot] = 1;
    rt.filamentScaleYSlot[slot] = scaleY;
  } else {
    rt.hasFilamentSlot[slot] = 0;
  }
}

// ── Reconcile — useEffect([emberSlots, tasks]) (§4.3) ────────────────────────
function reconcile(
  sys: EmberSystem,
  emberSlots: EmberSlot[],
  tasks: ReturnType<typeof useWorldData>["tasks"],
): void {
  const rt = sys.runtime;

  // Filament membership needs the task rows (priority); join by id.
  const taskById = new Map(tasks.map((t) => [t.id, t]));

  // Dev-only synthetic load (§10 step 7). Never runs in prod / when unset.
  let workingSlots = emberSlots;
  if (DEV_SEED > 0) {
    workingSlots = emberSlots.slice();
    const base = emberSlots.length;
    for (let i = 0; i < DEV_SEED; i++) {
      const state: EmberState =
        i % 3 === 0 ? "today" : i % 3 === 1 ? "overdue" : "ambient";
      workingSlots.push({
        taskId: `__seed_${i}`,
        lanternId: null,
        basePosition: trunkShellPosition(base + i),
        state,
      });
    }
  }

  const nextByTask = new Map<string, EmberSlot>();
  for (const es of workingSlots) nextByTask.set(es.taskId, es);

  let aStateDirty = false;
  let colorDirty = false;

  // 1. Removals → begin a leave (freed later by the frame loop when scale ≈ 0).
  for (const [taskId, slot] of Array.from(rt.index)) {
    if (!nextByTask.has(taskId)) {
      rt.leavingByTask.set(taskId, slot);
      rt.index.delete(taskId);
      rt.scaleTarget[slot] = 0;
    }
  }

  // 2. Updates + additions.
  for (const [taskId, es] of nextByTask) {
    const task = taskById.get(taskId);
    const filament = task !== undefined && hasFilament(task);
    const scaleY = task !== undefined ? filamentScaleY(task) : 0;

    const resident = rt.index.get(taskId);
    if (resident !== undefined) {
      // Update: retarget (settle drift / overdue sag), reclassify if changed.
      setTarget(sys, resident, es.basePosition, es.state);
      updateFilamentSlot(rt, resident, filament, scaleY);
      if (rt.stateId[resident] !== STATE_ID[es.state]) {
        applyState(sys, resident, es.state);
        aStateDirty = true;
        colorDirty = true;
      }
      continue;
    }

    const leaving = rt.leavingByTask.get(taskId);
    if (leaving !== undefined) {
      // Re-add during leave (delete→recreate, or reclassify mid-leave): reclaim.
      rt.leavingByTask.delete(taskId);
      rt.index.set(taskId, leaving);
      rt.scaleTarget[leaving] = 1;
      setTarget(sys, leaving, es.basePosition, es.state);
      updateFilamentSlot(rt, leaving, filament, scaleY);
      applyState(sys, leaving, es.state);
      _emberPickMap.set(leaving, taskId);
      aStateDirty = true;
      colorDirty = true;
      continue;
    }

    // Addition: pull a fresh slot; spawn in place, animate scale 0→1 + pop.
    const slot = rt.free.pop();
    if (slot === undefined) {
      warnCapOnce();
      continue;
    }
    rt.index.set(taskId, slot);
    rt.alive[slot] = 1;
    if (slot + 1 > rt.highWater) rt.highWater = slot + 1;
    const o = slot * 3;
    rt.pos[o] = es.basePosition[0];
    rt.pos[o + 1] = es.basePosition[1];
    rt.pos[o + 2] = es.basePosition[2];
    setTarget(sys, slot, es.basePosition, es.state);
    rt.scale[slot] = 0;
    rt.scaleTarget[slot] = 1;
    rt.pop[slot] = ENTER_POP;
    sys.aStateArr[slot * 2 + 1] = hash01(taskId) * Math.PI * 2; // phase, once
    updateFilamentSlot(rt, slot, filament, scaleY);
    applyState(sys, slot, es.state);
    _emberPickMap.set(slot, taskId);
    aStateDirty = true;
    colorDirty = true;
  }

  if (aStateDirty) sys.aState.needsUpdate = true;
  if (colorDirty && sys.emberMesh.instanceColor !== null) {
    sys.emberMesh.instanceColor.needsUpdate = true;
  }
  rt.motion = true;
  rt.taperDirty = true;
}

// ── Ascent — the sacred animation (§6) ───────────────────────────────────────
// One seam so U-19 (reduced motion) can branch this without touching the runtime.
function beginAscent(
  sys: EmberSystem,
  tr: TaskTransition,
  invalidate: () => void,
): void {
  const rt = sys.runtime;
  let slot: number;

  const resident = rt.index.get(tr.taskId);
  const leaving = rt.leavingByTask.get(tr.taskId);
  if (resident !== undefined) {
    // Event arrived before any refetch reconcile.
    slot = resident;
    rt.index.delete(tr.taskId);
  } else if (leaving !== undefined) {
    // NORMAL path: reconcile already started a leave this same commit — reclaim.
    slot = leaving;
    rt.leavingByTask.delete(tr.taskId);
    rt.scaleTarget[slot] = 1;
    if (rt.scale[slot] < 0.5) rt.scale[slot] = 1; // leave just began; keep visible
  } else {
    // No instance (a delayed leave fully finished): spawn fresh so the spark
    // never silently no-ops.
    const fresh = rt.free.pop();
    if (fresh === undefined) {
      warnCapOnce();
      return;
    }
    slot = fresh;
    if (slot + 1 > rt.highWater) rt.highWater = slot + 1;
    const o = slot * 3;
    rt.pos[o] = tr.slot.basePosition[0];
    rt.pos[o + 1] = tr.slot.basePosition[1];
    rt.pos[o + 2] = tr.slot.basePosition[2];
    rt.scale[slot] = 1;
    rt.scaleTarget[slot] = 1;
    rt.pop[slot] = 1;
    sys.aStateArr[slot * 2 + 1] = hash01(tr.taskId) * Math.PI * 2;
    _emberPickMap.set(slot, tr.taskId);
  }

  rt.alive[slot] = 1;
  writeBaseColor(sys, slot, tr.from); // flare rides this from-state hue
  applyState(sys, slot, "ascending"); // aState.x = 3 → shader glow floor
  sys.aState.needsUpdate = true;
  if (sys.emberMesh.instanceColor !== null) {
    sys.emberMesh.instanceColor.needsUpdate = true;
  }

  // Enqueue an ascent entry from the fixed pool. If exhausted, complete the
  // oldest instantly (bell + free) and reuse — never allocate.
  if (rt.ascendCount >= ASCENT_POOL) {
    worldEvents.emit("chime", { kind: "glass-bell" });
    finalizeAscent(sys, rt.ascending[0]);
    const last = rt.ascending[rt.ascendCount - 1];
    rt.ascending[rt.ascendCount - 1] = rt.ascending[0];
    rt.ascending[0] = last;
    rt.ascendCount--;
    sys.emberMesh.instanceMatrix.needsUpdate = true;
  }
  const entry = rt.ascending[rt.ascendCount];
  entry.slot = slot;
  entry.t = 0;
  entry.from.fromArray(rt.pos, slot * 3); // CURRENT animated position
  rt.ascendCount++;

  rt.motion = true;
  rt.taperDirty = true; // its filament vanishes at the flare
  invalidate();
}

// Advance one ascent entry; write its matrix + HDR color. Returns true at apex.
function stepAscent(sys: EmberSystem, e: AscentEntry): boolean {
  const slot = e.slot;
  const t = e.t;
  if (t >= APEX_MS) return true;

  const fx = e.from.x;
  const fy = e.from.y;
  const fz = e.from.z;
  let y = fy;
  let scl = 1;
  let hdr = 1;

  if (t < FLARE_MS) {
    // Flare: held in place, color 1 → 3 (×flareMul).
    hdr = 1 + (FLARE_MUL - 1) * (t / FLARE_MS);
  } else {
    // Rise: +6y over 2200 ms ease-in-cubic; a plumb line (x/z held).
    const u = (t - FLARE_MS) / RISE_MS; // 0 → 1
    const eased = u * u * u; // easeInCubic
    y = fy + RISE_Y * eased;
    hdr = FLARE_MUL + (RISE_HDR_END - FLARE_MUL) * u; // 3 → 1.2
    // Dissolve: scale 1 → 0 via smoothstep over the last 600 ms.
    const dissolveStart = APEX_MS - DISSOLVE_MS; // 1900 ms
    if (t >= dissolveStart) {
      const d = (t - dissolveStart) / DISSOLVE_MS; // 0 → 1
      scl = 1 - d * d * (3 - 2 * d);
    }
  }

  _dummy.position.set(fx, y, fz);
  _dummy.scale.setScalar(scl);
  _dummy.updateMatrix();
  sys.emberMesh.setMatrixAt(slot, _dummy.matrix);
  writeInstanceColor(sys, slot, hdr);
  return false;
}

// Free an ascended slot: scale-0 matrix, release to the freelist.
function finalizeAscent(sys: EmberSystem, e: AscentEntry): void {
  const rt = sys.runtime;
  const slot = e.slot;
  _dummy.position.set(0, 0, 0);
  _dummy.scale.setScalar(0);
  _dummy.updateMatrix();
  sys.emberMesh.setMatrixAt(slot, _dummy.matrix);
  rt.alive[slot] = 0;
  rt.stateId[slot] = 0;
  rt.scale[slot] = 0;
  rt.scaleTarget[slot] = 0;
  rt.free.push(slot);
  _emberPickMap.delete(slot);
  rt.taperDirty = true;
}

// ── Priority filaments — repack + follow (§7) ────────────────────────────────
// Wholesale rebuild of the dense taper list from resident, non-ascending,
// non-leaving embers that carry a filament.
function repackTapers(sys: EmberSystem): void {
  const rt = sys.runtime;
  let k = 0;
  for (let s = 0; s < rt.highWater; s++) {
    if (
      rt.alive[s] === 1 &&
      rt.stateId[s] !== 3 && // not ascending
      rt.scaleTarget[s] !== 0 && // not leaving
      rt.hasFilamentSlot[s] === 1
    ) {
      if (k < MAX_TAPERS) {
        rt.taperParentSlot[k] = s;
        rt.taperScaleY[k] = rt.filamentScaleYSlot[s];
      }
      k++;
    }
  }
  if (k > MAX_TAPERS) {
    warnTaperOnce();
    k = MAX_TAPERS;
  }
  rt.taperCount = k;
  sys.taperMesh.count = k;
}

// Track each filament to its parent ember every motion frame.
function followTapers(sys: EmberSystem): void {
  const rt = sys.runtime;
  const n = rt.taperCount;
  if (n === 0) return;
  for (let k = 0; k < n; k++) {
    const s = rt.taperParentSlot[k];
    const o = s * 3;
    _dummy.position.set(rt.pos[o], rt.pos[o + 1] + 0.03, rt.pos[o + 2]);
    const sc = rt.scale[s];
    _dummy.scale.set(sc, sc * rt.taperScaleY[k], sc);
    _dummy.updateMatrix();
    sys.taperMesh.setMatrixAt(k, _dummy.matrix);
  }
  sys.taperMesh.instanceMatrix.needsUpdate = true;
}

// ── The frame loop — ONE useFrame, allocation-free (§5) ──────────────────────
function stepFrame(
  sys: EmberSystem,
  delta: number,
  invalidate: () => void,
): void {
  const dt = Math.min(delta, 0.1); // cap: a background-tab return can't teleport
  let clock = emberUniforms.uEmberTime.value + dt;
  if (clock > CLOCK_WRAP) clock -= CLOCK_WRAP;
  emberUniforms.uEmberTime.value = clock; // pulse rides ANY demanded frame

  const rt = sys.runtime;
  if (!rt.motion && !rt.taperDirty) return; // sleeping field costs one add

  const emberMesh = sys.emberMesh;
  let stillMoving = false;
  let matrixDirty = false;
  let colorDirty = false;

  // 1. Settle + enter/leave over resident (non-ascending) slots.
  for (let s = 0; s < rt.highWater; s++) {
    if (rt.alive[s] === 0) continue;
    if (rt.stateId[s] === 3) continue; // ascending — handled below

    const o = s * 3;
    _va.fromArray(rt.pos, o);
    _vb.fromArray(rt.target, o);
    const moving = easing.damp3(_va, _vb, SETTLE_SMOOTH, dt);
    _va.toArray(rt.pos, o);

    const ns = THREE.MathUtils.damp(rt.scale[s], rt.scaleTarget[s], SPRING_LAMBDA, dt);
    rt.scale[s] = ns;
    const scaleMoving = Math.abs(ns - rt.scaleTarget[s]) > 1e-4;

    // Emissive pop decay (color ×pop → ×1).
    if (rt.pop[s] > 1.0001) {
      const np = THREE.MathUtils.damp(rt.pop[s], 1, POP_LAMBDA, dt);
      rt.pop[s] = Math.abs(np - 1) < 0.01 ? 1 : np;
      writeInstanceColor(sys, s, rt.pop[s]);
      colorDirty = true;
      if (rt.pop[s] > 1) stillMoving = true;
    }

    // Leave completion.
    if (rt.scaleTarget[s] === 0 && ns < 0.01) {
      rt.scale[s] = 0;
      _dummy.position.fromArray(rt.pos, o);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      emberMesh.setMatrixAt(s, _dummy.matrix);
      matrixDirty = true;
      rt.alive[s] = 0;
      rt.stateId[s] = 0;
      rt.free.push(s);
      _emberPickMap.delete(s);
      for (const [tid, sl] of rt.leavingByTask) {
        if (sl === s) {
          rt.leavingByTask.delete(tid);
          break;
        }
      }
      rt.taperDirty = true;
      continue;
    }

    if (moving || scaleMoving) {
      _dummy.position.fromArray(rt.pos, o);
      _dummy.scale.setScalar(ns);
      _dummy.updateMatrix();
      emberMesh.setMatrixAt(s, _dummy.matrix);
      matrixDirty = true;
      stillMoving = true;
    }
  }

  // 2. Ascent sweep (swap-remove finished entries).
  const asc = rt.ascending;
  for (let i = 0; i < rt.ascendCount; ) {
    const e = asc[i];
    e.t += dt * 1000;
    const finished = stepAscent(sys, e);
    matrixDirty = true;
    colorDirty = true;
    if (finished) {
      worldEvents.emit("chime", { kind: "glass-bell" }); // once, at apex
      finalizeAscent(sys, e);
      const last = asc[rt.ascendCount - 1];
      asc[rt.ascendCount - 1] = asc[i];
      asc[i] = last;
      rt.ascendCount--;
    } else {
      stillMoving = true;
      i++;
    }
  }

  // 3. Tapers: repack on dirty, follow whenever parents moved.
  if (rt.taperDirty) {
    repackTapers(sys);
    rt.taperDirty = false;
    followTapers(sys);
  } else if (stillMoving) {
    followTapers(sys);
  }

  // 4. Flush dirty flags at most once each.
  if (matrixDirty) emberMesh.instanceMatrix.needsUpdate = true;
  if (colorDirty && emberMesh.instanceColor !== null) {
    emberMesh.instanceColor.needsUpdate = true;
  }

  // 5. Keep demanding frames while anything animates; otherwise sleep.
  rt.motion = stillMoving;
  if (stillMoving) invalidate();
}

/**
 * The whole task layer: two InstancedMeshes, ONE frame loop. Consumes
 * `useWorldData().emberSlots`/`.tasks` and `worldEvents`. Produces exactly two
 * draw calls; renders only on data change (React DevTools shows no per-row churn).
 */
export function Embers(): JSX.Element {
  const invalidate = useThree((s) => s.invalidate);
  const { emberSlots, tasks } = useWorldData();

  const sys = useMemo(() => buildSystem(), []);

  // Dispose per-mount GPU resources on unmount (never the shared geometries).
  useEffect(() => {
    return () => {
      sys.emberMesh.dispose();
      sys.taperMesh.dispose();
      sys.emberMaterial.dispose();
      sys.taperMaterial.dispose();
      _emberPickMap.clear();
    };
  }, [sys]);

  // Reconcile against declarative truth (child effect → runs before the
  // provider's parent completion emit, §4.4).
  useEffect(() => {
    reconcile(sys, emberSlots, tasks);
    invalidate();
  }, [sys, emberSlots, tasks, invalidate]);

  // Ascent trigger. `on` returns a disposer (StrictMode-safe).
  useEffect(() => {
    return worldEvents.on("task-completed", (tr) =>
      beginAscent(sys, tr, invalidate),
    );
  }, [sys, invalidate]);

  useFrame((_, delta) => stepFrame(sys, delta, invalidate));

  return (
    <>
      <primitive object={sys.emberMesh} />
      <primitive object={sys.taperMesh} />
    </>
  );
}

export default Embers;
