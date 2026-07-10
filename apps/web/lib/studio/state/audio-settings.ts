"use client";

/**
 * audio-settings — whether the studio's HUD sound cues are muted.
 *
 * A framework-light external store (a module singleton read through
 * `useSyncExternalStore`), in the exact mold of `active-row.ts`. It holds a
 * single `muted: boolean`.
 *
 * Ownership:
 * - WRITER: the HUD mute button (`StudioMuteToggle`) is the SINGLE writer, via
 *   `toggleMuted` / `setMuted`. It never touches the audio engine directly —
 *   the audio hook subscribes here and forwards the value to the engine, keeping
 *   the one-writer discipline the other studio stores document.
 * - READER: `useStudioAudio` (forwards to `engine.setMuted`) and the toggle
 *   button (for its pressed state).
 *
 * Default is computed lazily on the first client read: muted when the user
 * prefers reduced motion, otherwise unmuted. The SSR snapshot is `true` (muted)
 * — the safe default before any gesture. jsdom has no `matchMedia`, which the
 * lazy read tolerates (treated as "no reduced-motion preference").
 *
 * In-memory only. `__resetAudioSettings()` restores the uninitialized state for
 * tests.
 */

import { useSyncExternalStore } from "react";

let muted: boolean | null = null; // null ⇒ not yet resolved (compute on first read)
const subscribers = new Set<() => void>();

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function emit(): void {
  for (const cb of subscribers) cb();
}

/** Current muted state. Resolves the reduced-motion default on first read. */
export function getMuted(): boolean {
  if (muted === null) muted = prefersReducedMotion();
  return muted;
}

/** Set the muted state explicitly. Single writer: the HUD mute button. */
export function setMuted(next: boolean): void {
  if (muted === next) return;
  muted = next;
  emit();
}

/** Flip the muted state. Single writer: the HUD mute button. */
export function toggleMuted(): void {
  setMuted(!getMuted());
}

export function subscribeMuted(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

/** React hook — re-renders only when the muted state flips. SSR snapshot: muted. */
export function useMuted(): boolean {
  return useSyncExternalStore(subscribeMuted, getMuted, () => true);
}

/** Test-only reset of module state. */
export function __resetAudioSettings(): void {
  muted = null;
  subscribers.clear();
}
