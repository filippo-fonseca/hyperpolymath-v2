"use client";

/**
 * Phase 7 — shared AudioContext singleton.
 *
 * Safari (and Chrome with strict autoplay) requires AudioContext to be
 * resumed inside a user-gesture event handler before any audio can play.
 * If we create a fresh AudioContext outside a gesture, it stays
 * `suspended` forever and decodeAudioData → buffer.start() produces
 * silence with no error.
 *
 * This singleton:
 *   - Survives across components (modal, JarvisListener, TtsPlayer)
 *   - Is unlocked the first time `unlockAudioContext()` is called from
 *     a user gesture (modal Enable click, PressToTalkButton click)
 *   - Can be read lazily by anyone via `getSharedAudioContext()` once
 *     the unlock has happened
 *
 * SSR safety: the lazy getter throws if called server-side.
 */

let ctx: AudioContext | null = null;

export function getSharedAudioContext(): AudioContext | null {
  return ctx;
}

/**
 * MUST be called from inside a user-gesture event handler (click, keydown).
 * Creates the AudioContext on first call and resumes it if suspended.
 * Returns the unlocked AudioContext.
 */
export async function unlockAudioContext(): Promise<AudioContext> {
  if (typeof window === "undefined") {
    throw new Error("unlockAudioContext called server-side");
  }
  if (!ctx) {
    ctx = new AudioContext();
  }
  if (ctx.state === "suspended") {
    await ctx.resume();
  }
  return ctx;
}
