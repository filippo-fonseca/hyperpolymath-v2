"use client";

/**
 * Chimes.tsx — U-18 · The Studiolo · chimes
 *
 * The mount point for the world's voice. A propless, render-null component (and
 * an equivalent `useChimes()` hook) that owns one `ChimeEngine` for its lifetime:
 *
 *   - on mount: builds the engine, arms the one-time gesture-unlock listener
 *     (`synth.ts` lazily creates + resumes the shared AudioContext on the first
 *     `pointerdown`/`keydown`), and subscribes to `worldEvents` `"chime"`,
 *     routing each `{ kind }` to the matching synthesized voice;
 *   - on unmount: unsubscribes, then disposes the engine (removes the unlock
 *     listeners and closes the AudioContext).
 *
 * No `three` — this is DOM/audio-level. It renders `null`, so it is equally at
 * home mounted inside the R3F `<Canvas>` tree or at the DOM layer; the
 * orchestrator wires `<Chimes/>` at the Wave-4 boundary. It is event-driven only
 * (no per-frame work) and, per PLAN §U-19, is intentionally NOT gated by
 * `prefers-reduced-motion` — sound is not motion, and the completion bell stays
 * audible under reduced motion.
 */

import { useEffect } from "react";
import { worldEvents } from "../data/diffing";
import { createChimeEngine } from "./synth";

/** Subscribe the shared chime engine to the world's `"chime"` events. */
export function useChimes(): void {
  useEffect(() => {
    const engine = createChimeEngine();
    engine.installGestureUnlock();
    // `worldEvents.on` returns a disposer (StrictMode-safe, per diffing.ts).
    const off = worldEvents.on("chime", ({ kind }) => engine.play(kind));
    return () => {
      off();
      engine.dispose();
    };
  }, []);
}

/** Propless, render-null host for the world's synthesized chimes. */
export function Chimes(): null {
  useChimes();
  return null;
}

export default Chimes;
