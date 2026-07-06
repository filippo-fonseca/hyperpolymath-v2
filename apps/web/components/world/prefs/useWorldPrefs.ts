"use client";

/**
 * useWorldPrefs.ts — U-19 · The Studiolo · reduced-motion-gating
 *
 * The ONE source of truth for the world's reduced-motion honesty layer. Every
 * prior unit intentionally left its reduced-motion decision behind a single
 * named `prefersReducedMotion()` seam (CameraRig, Fireflies, JarvisRing,
 * JarvisRibbon, useJarvisChoreography, useLitanySequence); U-19 re-points all of
 * them here so `prefers-reduced-motion: reduce` is honored consistently and
 * live-reactively from ONE place.
 *
 * Two shapes, one probe:
 *
 *   - `worldPrefersReducedMotion()` — a module-level, read-at-call-time boolean.
 *     SSR-safe (false when there is no window). This is what module-scope callers
 *     use: the `cameraBus.flyTo` singleton, the ember-ascent / firefly runtimes,
 *     and the boot decision — none of which live inside a React render and so
 *     cannot use a hook. Reading at call time keeps them naturally current.
 *
 *   - `useWorldPrefs()` — a React hook (via `useSyncExternalStore`) that
 *     SUBSCRIBES to the media query's `change` event and re-renders the consumer
 *     when the OS setting flips mid-session. For units that read the flag in
 *     render (JarvisRing, JarvisRibbon) so they stay live without a remount.
 *
 * Scope note (PLAN §6 U-19): the contract is the media query only — no manual
 * localStorage override for reduced motion is specified, so this stays a thin,
 * correct wrapper around `matchMedia` + its subscription. Sound (U-18 chimes) is
 * NOT gated by reduced motion; the completion bell stays audible.
 */

import { useSyncExternalStore } from "react";

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Read `prefers-reduced-motion: reduce` at call time. SSR-safe: returns false
 * when there is no window. Mirrors the exact expression every prior unit's local
 * seam used, so delegating to it changes the SOURCE, never the behavior.
 */
export function worldPrefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia(REDUCED_MOTION_QUERY).matches
  );
}

// ── useSyncExternalStore wiring (stable module-scope refs) ───────────────────

function subscribe(onStoreChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mql = window.matchMedia(REDUCED_MOTION_QUERY);
  mql.addEventListener("change", onStoreChange);
  return () => mql.removeEventListener("change", onStoreChange);
}

// getSnapshot returns a primitive boolean → stable identity, no render loop.
function getSnapshot(): boolean {
  return worldPrefersReducedMotion();
}

function getServerSnapshot(): boolean {
  return false;
}

export interface WorldPrefs {
  /** Live `prefers-reduced-motion: reduce` — re-renders the consumer on change. */
  reducedMotion: boolean;
}

/**
 * Live reduced-motion preference for components that read it in render. Backed by
 * `useSyncExternalStore` subscribed to the media query, so flipping the OS
 * setting while the world is open updates the consumer without a remount.
 */
export function useWorldPrefs(): WorldPrefs {
  const reducedMotion = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  return { reducedMotion };
}
