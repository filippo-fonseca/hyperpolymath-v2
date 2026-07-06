"use client";

/**
 * PerfGovernor.tsx — U-20 · The Studiolo · perf-hardening
 *
 * The adaptive-resolution governor. It watches sustained frame rate via drei's
 * `<PerformanceMonitor>` and steps the renderer's device-pixel-ratio DOWN a
 * fixed ladder (2 → 1.5 → 1) when the chamber runs heavy, then back UP when it
 * recovers. This is the §7.6 mechanism: `dpr={[1,2]}` clamped at the Canvas,
 * governed downward here. Cheapest possible win — halving resolution is the
 * single biggest GPU lever, and it never touches geometry, materials, or any
 * frozen contract.
 *
 * ── DEMAND-MODE SAFETY (the load-bearing subtlety) ──────────────────────────
 * The world runs `frameloop="demand"` — it renders ONLY on demanded frames and
 * truly sleeps (0 rAF) when idle. Two properties make this governor safe there:
 *
 *   1. It never demands a frame to sample. drei's `<PerformanceMonitor>` reads
 *      fps from a bare `useFrame` and does NOT call `invalidate()` (verified
 *      against drei 10.7.x source). So it only samples on frames OTHER systems
 *      already demanded, and adds ZERO rAF when the world sleeps. Our own frame
 *      observer below is likewise passive (never invalidates).
 *
 *   2. It ignores untrustworthy samples. Under demand mode, fps computed from
 *      SPARSE demanded frames (e.g. a lone hover kick, or the firefly 5 fps
 *      idle heartbeat) is meaninglessly low — the gap between frames is large
 *      because nothing asked to render, not because the GPU is slow. Acting on
 *      that would spuriously drop dpr while idle. So we only honour a
 *      decline/incline when we've just seen a run of DENSE, back-to-back frames
 *      (a genuine glide/orbit/animation loop) — the only context in which the
 *      fps figure reflects real GPU cost.
 *
 * The single `setDpr` call (plus one `invalidate()` to repaint at the new
 * resolution) is the entire footprint. No new deps; drei is already in the tree
 * (CameraControls, Environment, PerformanceMonitor all ship in it).
 */

import { useCallback, useEffect, useRef, type ReactElement } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";

// ── The dpr ladder (§7.6) ───────────────────────────────────────────────────
// Rung 0 is the crisp default; each decline steps one rung down toward 1.0,
// each incline steps one rung back up. Values are clamped into [DPR_MIN, device
// max] at apply time so a non-retina display never gets pushed above its native
// pixel ratio.
const DPR_LADDER = [2, 1.5, 1] as const;
const DPR_MIN = 1;
const DPR_MAX = 2;

// A frame counts as "dense" (part of a real render loop) when it arrived within
// this many seconds of the previous rendered frame. 0.1 s ⇒ ≥10 fps continuous
// rendering qualifies, while the firefly idle heartbeat (200 ms / 5 fps, the
// coarsest sanctioned idle demander per §7.5) is correctly excluded.
const DENSE_DT_SEC = 0.1;
// How many consecutive dense frames must precede a governor action for its fps
// sample to be trusted (~1/3 s of sustained rendering at 60 fps). Well under the
// ~2.5 s PerformanceMonitor needs to fire, so genuine load always qualifies.
const MIN_DENSE_FRAMES = 20;
const DENSE_STREAK_CAP = 240;

function clampInt(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

function clampNum(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * PerfGovernor — mount once inside <Canvas> (via WorldScene). Renders the
 * PerformanceMonitor (which itself renders nothing visible) and a passive frame
 * observer; contributes zero draw calls and zero idle rAF.
 */
export function PerfGovernor(): ReactElement {
  const setDpr = useThree((s) => s.setDpr);
  const invalidate = useThree((s) => s.invalidate);

  const ladderIndex = useRef(0); // current rung in DPR_LADDER
  const denseStreak = useRef(0); // consecutive dense (real-loop) frames seen
  const maxDpr = useRef(DPR_MAX); // clamp ceiling = min(2, device pixel ratio)

  useEffect(() => {
    if (typeof window !== "undefined") {
      maxDpr.current = Math.min(DPR_MAX, window.devicePixelRatio || DPR_MAX);
    }
  }, []);

  // Passive frame-density observer. NEVER invalidates → adds no demand, so the
  // world still sleeps to 0 rAF when idle. `delta` is R3F's inter-frame gap; a
  // run of small deltas means frames are genuinely back-to-back (a live loop),
  // the only context where PerformanceMonitor's fps is trustworthy here.
  useFrame((_, delta) => {
    if (delta > 0 && delta < DENSE_DT_SEC) {
      denseStreak.current = Math.min(
        denseStreak.current + 1,
        DENSE_STREAK_CAP,
      );
    } else {
      denseStreak.current = 0;
    }
  });

  const trustworthy = useCallback(
    () => denseStreak.current >= MIN_DENSE_FRAMES,
    [],
  );

  const applyRung = useCallback(
    (nextIndex: number) => {
      const clamped = clampInt(nextIndex, 0, DPR_LADDER.length - 1);
      if (clamped === ladderIndex.current) return; // already at the rail
      ladderIndex.current = clamped;
      const dpr = clampNum(DPR_LADDER[clamped], DPR_MIN, maxDpr.current);
      setDpr(dpr);
      invalidate(); // repaint once so the new render-target size takes effect
      if (process.env.NODE_ENV !== "production") {
        console.info(`[PerfGovernor] dpr → ${dpr} (rung ${clamped})`);
      }
    },
    [setDpr, invalidate],
  );

  // Sustained low fps → step dpr DOWN one rung (2 → 1.5 → 1).
  const onDecline = useCallback(() => {
    if (!trustworthy()) return; // sparse/idle frames: not a real slowdown
    applyRung(ladderIndex.current + 1);
  }, [applyRung, trustworthy]);

  // Sustained healthy fps → step dpr back UP one rung toward crisp.
  const onIncline = useCallback(() => {
    if (!trustworthy()) return;
    applyRung(ladderIndex.current - 1);
  }, [applyRung, trustworthy]);

  return <PerformanceMonitor onDecline={onDecline} onIncline={onIncline} />;
}

export default PerfGovernor;
