"use client";

/**
 * LightThread.tsx — U-16 · The Studiolo · jarvis-routing-choreography
 *
 * The thesis animation's brush stroke: a cyan light-thread that leaps from the
 * ring and draws along the correct bough to the routed destination, a comet of
 * light whose lit span travels and then drains into the landing point exactly
 * as U-14's firefly cools gold there.
 *
 * A fixed pool of 2 thread runtimes shares ONE additive HDR-cyan material and is
 * advanced by ONE `useFrame`. The animation is drawRange-only (PLAN §6 U-16,
 * PLAN.md:532) — the TubeGeometry is built ONCE per routing (routing cadence, a
 * few per minute) and disposed at thread end (PLAN §7.9). Idle → the frame loop
 * early-returns, zero rAF demand (PLAN §7.5(e) active runtime).
 *
 * `lightThreadBus` is a module singleton (the Fireflies.fireflyBus pattern): the
 * mounted <LightThreads/> mirrors its pool into module refs; the bus no-ops with
 * a warn when unmounted and NEVER hangs (unmount resolves all in-flight
 * promises). `draw()` resolves when the head reaches the end of the path
 * (t = durationMs) — "the light arrived" — NOT at dissolve end.
 */

import { useEffect, useMemo, type ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

import { STUDIOLO } from "../materials/tokens";
import { boughPoint, type BoughLayout } from "../data/treeLayout";
import type { ChoreographyTarget } from "./useJarvisChoreography";

// ── Frozen timeline constants (mirror U-14's flight timeline; §5) ─────────────
const LEAD_MS = 60; // the thread head leads the firefly ("light shows the way")
const DRAW_MS = 1350 - LEAD_MS; // 1290; firefly T_LAND_END 1350, mirrors Fireflies.tsx:94
const TAIL_DELAY_MS = 450;
const DRAIN_END_MS = 1600; // tail completes just before dissolve end (1630, Fireflies.tsx:95)
const FADE_MS = 150; // belt-and-suspenders opacity fade of the last segment
const SPEED_PULSE_A = 0.5; // s(u)=u−(A/2π)sin(2πu), mirrors Fireflies.tsx:96
const FLIGHT_LIFT = 0.08; // skim ABOVE the limb, never intersect it; mirrors Fireflies.tsx:97
const DRAIN_GAP_MS = DRAIN_END_MS - DRAW_MS; // 310 — tail-after-head lag, held for micro too

// ── Geometry / material constants (§4.1–§4.2) ─────────────────────────────────
const TUBE_SEGMENTS = 64;
const RADIAL_SEGMENTS = 5;
const THREAD_RADIUS = 0.006;
const INDICES_PER_SEGMENT = RADIAL_SEGMENTS * 6; // 30 — one tubular ring's indices
const THREAD_HDR = 2.6; // > Bloom luminanceThreshold 1 (STUDIOLO.jarvisCyan, tokens.ts:19)
const BASE_OPACITY = 0.9;

// Micro-thread variant (update_task attention flick; §4.6).
const MICRO_MS = 600;
const MICRO_TAIL_DELAY_MS = 200;

const THREAD_POOL = 2; // PLAN §6 U-16: at most 2 concurrent

// ── Shared additive HDR-cyan material (module singleton; §4.2) ────────────────
// One material for both pool meshes. HDR > 1 trips Bloom (the world's only glow
// engine). Never disposed — a module singleton like JarvisRing's ring materials.
const CYAN = new THREE.Color(STUDIOLO.jarvisCyan);
const THREAD_MATERIAL = new THREE.MeshBasicMaterial({
  toneMapped: false,
  transparent: true,
  opacity: BASE_OPACITY,
  blending: THREE.AdditiveBlending, // mirror Fireflies.tsx:182-188
  depthWrite: false,
});
THREAD_MATERIAL.color.copy(CYAN).multiplyScalar(THREAD_HDR);

// ── Types (§11) ───────────────────────────────────────────────────────────────
export interface ThreadRequest {
  from: THREE.Vector3; // ring world origin (caller's scratch; cloned in)
  target: ChoreographyTarget;
  bough: BoughLayout | null; // lantern targets: the path's limb; else null
  durationMs?: number; // head-draw time; default 1290 (=1350−LEAD_MS)
}

interface ThreadEntry {
  active: boolean;
  mesh: THREE.Mesh; // persistent; geometry swapped per routing
  geometry: THREE.TubeGeometry | null; // disposed at thread end
  startedAt: number; // performance.now()
  drawMs: number; // head-draw duration
  tailDelayMs: number;
  drainEndMs: number; // tail reaches 1
  totalMs: number; // drainEndMs + FADE_MS
  resolve: (() => void) | null; // fired ONCE when the head reaches the path end
}

// ── Module mirrors for the bus (set on mount, nulled on unmount; §4.5) ────────
let _entries: ThreadEntry[] | null = null;
let _invalidate: (() => void) | null = null;

// ── Small pure helpers ────────────────────────────────────────────────────────
function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

// The firefly's speed pulse, s(u) = u − (A/2π)·sin(2πu) — head + firefly stay
// visually locked, the head one beat ahead (§4.3, mirrors Fireflies.tsx:621).
function speedPulse(u: number): number {
  return u - (SPEED_PULSE_A / (2 * Math.PI)) * Math.sin(2 * Math.PI * u);
}

// Recover the landing curve parameter numerically: 33 coarse + 9 refine samples.
// Identical math to U-14's private findLanternT (Fireflies.tsx:421-451) —
// duplicated here rather than widening a frozen file's surface (§4.1).
function nearestBoughT(bough: BoughLayout, target: THREE.Vector3): number {
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

// ── Curve + geometry construction (once per routing; §4.1) ────────────────────
function buildGeometry(req: ThreadRequest): THREE.TubeGeometry {
  const from = req.from.clone();
  const tgt = new THREE.Vector3(
    req.target.point[0],
    req.target.point[1],
    req.target.point[2],
  );

  let curve: THREE.CatmullRomCurve3;
  if (req.bough !== null) {
    // Lantern target: trace the same limb the firefly flies. `centripetal` is
    // mandatory — it cannot cusp/self-intersect on the ring→root long hop vs the
    // short limb samples (§4.1).
    const b = req.bough;
    const tLand = nearestBoughT(b, tgt);
    const p1 = new THREE.Vector3(b.start[0], b.start[1] + FLIGHT_LIFT, b.start[2]);
    const bp2 = boughPoint(b, 0.33 * tLand);
    const bp3 = boughPoint(b, 0.66 * tLand);
    const p2 = new THREE.Vector3(bp2[0], bp2[1] + FLIGHT_LIFT, bp2[2]);
    const p3 = new THREE.Vector3(bp3[0], bp3[1] + FLIGHT_LIFT, bp3[2]);
    curve = new THREE.CatmullRomCurve3(
      [from, p1, p2, p3, tgt],
      false,
      "centripetal",
    );
  } else {
    // Trunk/swarm target (no bough): a shallow arc, not a laser (§4.1).
    const mid = from.clone().lerp(tgt, 0.5);
    mid.y += 0.25;
    curve = new THREE.CatmullRomCurve3([from, mid, tgt], false, "centripetal");
  }

  return new THREE.TubeGeometry(
    curve,
    TUBE_SEGMENTS,
    THREAD_RADIUS,
    RADIAL_SEGMENTS,
    false,
  );
}

// Force-finish an entry instantly (pool overflow / unmount): resolve, dispose.
function finishEntryInstant(e: ThreadEntry): void {
  if (e.resolve !== null) {
    const r = e.resolve;
    e.resolve = null;
    r();
  }
  if (e.geometry !== null) {
    e.geometry.dispose();
    e.geometry = null;
  }
  e.mesh.visible = false;
  e.active = false;
}

// ── The bus singleton (unmount-resolves, never hangs; §11) ────────────────────
export const lightThreadBus: {
  draw(req: ThreadRequest): Promise<void>;
} = {
  draw(req: ThreadRequest): Promise<void> {
    return new Promise<void>((resolve) => {
      const entries = _entries;
      if (entries === null) {
        console.warn(
          "[studiolo] lightThreadBus.draw: world not mounted; resolving no-op.",
        );
        resolve();
        return;
      }

      // Acquire a free entry; overflow finishes the OLDEST instantly (§4.5).
      let entry = entries.find((e) => !e.active);
      if (entry === undefined) {
        entry = entries[0]!;
        for (const e of entries) if (e.startedAt < entry.startedAt) entry = e;
        finishEntryInstant(entry);
      }

      const geom = buildGeometry(req);
      if (entry.geometry !== null) entry.geometry.dispose();
      entry.geometry = geom;
      entry.mesh.geometry = geom;
      entry.mesh.visible = true;

      const drawMs = req.durationMs ?? DRAW_MS;
      const isMicro = drawMs <= MICRO_MS;
      entry.active = true;
      entry.startedAt = performance.now();
      entry.drawMs = drawMs;
      entry.tailDelayMs = isMicro ? MICRO_TAIL_DELAY_MS : TAIL_DELAY_MS;
      entry.drainEndMs = drawMs + DRAIN_GAP_MS;
      entry.totalMs = entry.drainEndMs + FADE_MS;
      entry.resolve = resolve;

      geom.setDrawRange(0, 0);
      _invalidate?.();
    });
  },
};

// ── Per-entry frame advance — the drawRange comet (§4.3) ──────────────────────
// Returns the fade opacity this frame if the entry is fading, else null.
function stepEntry(e: ThreadEntry, now: number): number | null {
  const t = now - e.startedAt;

  // Resolve when the head reaches the path end (§11: "the light arrived").
  if (e.resolve !== null && t >= e.drawMs) {
    const r = e.resolve;
    e.resolve = null;
    r();
  }

  // Finish: clear the range, dispose, free the slot.
  if (t >= e.totalMs) {
    if (e.geometry !== null) {
      e.geometry.setDrawRange(0, 0);
      e.geometry.dispose();
      e.geometry = null;
    }
    e.mesh.visible = false;
    e.active = false;
    return null;
  }

  const geom = e.geometry;
  if (geom === null) {
    e.active = false;
    return null;
  }

  // Head H(t): 0→1 over [0, drawMs], speed-pulse eased (locked to the firefly).
  const H = speedPulse(clamp01(t / e.drawMs));

  // Tail T(t): holds 0 until tailDelay, then 0→1 over [tailDelay, drainEnd],
  // easeInQuad. The lit span [T, H] is a comet — the light travels (§4.3).
  let T = 0;
  if (t > e.tailDelayMs) {
    const tu = clamp01((t - e.tailDelayMs) / (e.drainEndMs - e.tailDelayMs));
    T = tu * tu;
  }

  const startIdx = Math.floor(T * TUBE_SEGMENTS) * INDICES_PER_SEGMENT;
  const endSeg = Math.ceil(H * TUBE_SEGMENTS);
  const count = Math.max(0, endSeg * INDICES_PER_SEGMENT - startIdx);
  geom.setDrawRange(startIdx, count);

  // Final fade of the last segment (§4.3): 0.9→0 over [drainEnd, drainEnd+FADE].
  if (t >= e.drainEndMs) {
    const fu = clamp01((t - e.drainEndMs) / FADE_MS);
    return BASE_OPACITY * (1 - fu);
  }
  return null;
}

// ── Mount-once pool construction ──────────────────────────────────────────────
function buildPool(): ThreadEntry[] {
  return Array.from({ length: THREAD_POOL }, () => {
    // A trivial empty placeholder geometry; swapped for a TubeGeometry per
    // routing. frustumCulled off — the thread spans ring-space to tree-space.
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), THREAD_MATERIAL);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.name = "light-thread";
    return {
      active: false,
      mesh,
      geometry: null,
      startedAt: 0,
      drawMs: DRAW_MS,
      tailDelayMs: TAIL_DELAY_MS,
      drainEndMs: DRAIN_END_MS,
      totalMs: DRAIN_END_MS + FADE_MS,
      resolve: null,
    };
  });
}

/**
 * The pool renderer: 2 meshes, 1 shared material, 1 useFrame (§4.5). Renders
 * ≤2 transient draw calls, 0 when idle. The frame loop invalidates ONLY while a
 * thread is live (a sanctioned active runtime, PLAN §7.5(e)).
 */
export function LightThreads(): ReactElement {
  const invalidate = useThree((s) => s.invalidate);
  const entries = useMemo(() => buildPool(), []);

  // Mirror the pool into module refs for the bus; resolve + dispose on unmount.
  useEffect(() => {
    _entries = entries;
    _invalidate = invalidate;
    return () => {
      for (const e of entries) {
        if (e.resolve !== null) {
          const r = e.resolve;
          e.resolve = null;
          r(); // never hang a caller on a world unmount
        }
        if (e.geometry !== null) {
          e.geometry.dispose();
          e.geometry = null;
        }
        // Dispose the persistent placeholder/last geometry attached to the mesh.
        e.mesh.geometry.dispose();
        e.active = false;
      }
      _entries = null;
      _invalidate = null;
    };
  }, [entries, invalidate]);

  useFrame(() => {
    const now = performance.now();
    let anyActive = false;
    let minFade: number | null = null;
    for (const e of entries) {
      if (!e.active) continue;
      const fade = stepEntry(e, now);
      if (e.active) anyActive = true;
      if (fade !== null) minFade = minFade === null ? fade : Math.min(minFade, fade);
    }
    // Opacity lives on the shared material only during the final fade (§4.2);
    // with ≤2 threads + a 150 ms fade the shared-fade approximation is invisible.
    if (minFade !== null) {
      THREAD_MATERIAL.opacity = minFade;
    } else if (THREAD_MATERIAL.opacity !== BASE_OPACITY) {
      THREAD_MATERIAL.opacity = BASE_OPACITY;
    }
    if (anyActive) invalidate(); // active runtime only; idle → zero rAF demand
  });

  return (
    <>
      {entries.map((e, i) => (
        <primitive key={i} object={e.mesh} />
      ))}
    </>
  );
}

export default LightThreads;
