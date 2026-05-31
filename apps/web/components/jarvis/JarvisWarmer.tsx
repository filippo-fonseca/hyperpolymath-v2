"use client";

/**
 * Phase 11 / CACHE-04 (D-03) — predictive cache warmer client component.
 *
 * Mounted in app/(app)/layout.tsx — covers every authenticated route once.
 *
 * Triggers a fire-and-forget POST /api/jarvis/warm on three UX signals:
 *   - Mount: app open (once per component mount)
 *   - window CustomEvent("jarvis-input-focus"): JARVIS console input gains focus
 *   - window CustomEvent("mic-arm"):           mic FSM idle → listening transition
 *
 * Per-trigger client-side debounce: 30s. Server-side age-gate (50min)
 * lives in /api/jarvis/warm and provides defence-in-depth — if a future
 * change drops the client debounce, the server still skips with 204.
 *
 * Renders null. All work is in useEffect.
 */

import { useEffect, useRef } from "react";

type WarmTrigger = "mount" | "input-focus" | "mic-arm";
const DEBOUNCE_MS = 30 * 1000;

export function JarvisWarmer(): null {
  // Per-trigger last-fire timestamps. Refs (not state) — debounce decisions
  // never need to trigger a re-render. A Map preserves cross-trigger
  // isolation per D-03 (input-focus inside the mount window still defers
  // input-focus, but mic-arm in the same window fires independently).
  const lastFiredRef = useRef<Map<WarmTrigger, number>>(new Map());

  useEffect(() => {
    const fire = (trigger: WarmTrigger): void => {
      const now = Date.now();
      const last = lastFiredRef.current.get(trigger) ?? 0;
      if (now - last < DEBOUNCE_MS) return;
      lastFiredRef.current.set(trigger, now);
      // Fire-and-forget. The endpoint enforces the server-side age-gate
      // (returns 204 if recently warmed) — we don't act on the response.
      fetch("/api/jarvis/warm", { method: "POST" }).catch(() => {
        // Network failures must NEVER surface to the user. Telemetry-only.
      });
    };

    // Trigger 1: mount (app open).
    fire("mount");

    // Trigger 2: input-focus — dispatched by JarvisInput.onFocus.
    const onInputFocus = (): void => fire("input-focus");
    window.addEventListener("jarvis-input-focus", onInputFocus);

    // Trigger 3: mic-arm — dispatched by JarvisListener on FSM
    // transition idle → listening (or any non-listening → listening edge,
    // see JarvisListener wiring).
    const onMicArm = (): void => fire("mic-arm");
    window.addEventListener("mic-arm", onMicArm);

    return () => {
      window.removeEventListener("jarvis-input-focus", onInputFocus);
      window.removeEventListener("mic-arm", onMicArm);
    };
  }, []);

  return null;
}
