/**
 * HUD settings store — the small, persisted external store the settings surface
 * writes and the ambient background / motion layers read.
 *
 * Framework-light (one `useSyncExternalStore` hook, like {@link ./widget-windows}
 * and the hand-status store) so a preference flip only re-renders the surfaces
 * that read it. Persisted to localStorage under a versioned key so choices
 * survive a reload.
 *
 * `motionMode` is a three-way override over the OS `prefers-reduced-motion`
 * signal: `system` defers to the media query, `full` forces motion on, `reduced`
 * forces it off. Consumers resolve the effective value with {@link prefersReducedMotion}.
 */

import { useSyncExternalStore } from "react";

const STORAGE_KEY = "studio:hud-settings:v1";

/** Explicit motion preference, overriding the OS media query when not `system`. */
export type MotionMode = "system" | "full" | "reduced";

export interface HudSettings {
  /** Ambient constellation + graph background on/off. Default on. */
  backgroundEnabled: boolean;
  /** Motion override; `system` defers to `prefers-reduced-motion`. */
  motionMode: MotionMode;
  /** Master toggle for incoming-message notifications (toast near the orb +
   *  auto-open the relevant widget). Default ON. When off, the watcher stops
   *  announcing entirely. */
  messageNotificationsEnabled: boolean;
  /** When ON, an announced message is ALSO spoken aloud through the TTS
   *  pipeline. Layered on top of the master toggle (no effect when
   *  notifications are off). Default OFF — the toast is quiet by default. */
  messageAutoReadEnabled: boolean;
  /** UI sound effects (widget drop pop, message-send cue) on/off. Default on. */
  soundEnabled: boolean;
}

const DEFAULTS: HudSettings = {
  backgroundEnabled: true,
  motionMode: "system",
  messageNotificationsEnabled: true,
  messageAutoReadEnabled: false,
  soundEnabled: true,
};

let state: HudSettings = DEFAULTS;
let hydrated = false;

const subscribers = new Set<() => void>();

function emit(): void {
  for (const cb of subscribers) cb();
}

function persist(): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be unavailable (private mode); preferences stay in-memory.
  }
}

/** Reads persisted settings once, on first access. Safe to call repeatedly. */
export function hydrateHudSettings(): void {
  if (hydrated) return;
  hydrated = true;
  if (typeof localStorage === "undefined") return;
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object") return;
    const value = parsed as Partial<HudSettings>;
    state = {
      backgroundEnabled:
        typeof value.backgroundEnabled === "boolean"
          ? value.backgroundEnabled
          : DEFAULTS.backgroundEnabled,
      motionMode:
        value.motionMode === "full" ||
        value.motionMode === "reduced" ||
        value.motionMode === "system"
          ? value.motionMode
          : DEFAULTS.motionMode,
      messageNotificationsEnabled:
        typeof value.messageNotificationsEnabled === "boolean"
          ? value.messageNotificationsEnabled
          : DEFAULTS.messageNotificationsEnabled,
      messageAutoReadEnabled:
        typeof value.messageAutoReadEnabled === "boolean"
          ? value.messageAutoReadEnabled
          : DEFAULTS.messageAutoReadEnabled,
      soundEnabled:
        typeof value.soundEnabled === "boolean"
          ? value.soundEnabled
          : DEFAULTS.soundEnabled,
    };
    emit();
  } catch {
    state = DEFAULTS;
  }
}

export function getHudSettings(): HudSettings {
  return state;
}

export function subscribeHudSettings(cb: () => void): () => void {
  subscribers.add(cb);
  return () => {
    subscribers.delete(cb);
  };
}

export function setBackgroundEnabled(enabled: boolean): void {
  if (state.backgroundEnabled === enabled) return;
  state = { ...state, backgroundEnabled: enabled };
  persist();
  emit();
}

export function setMotionMode(mode: MotionMode): void {
  if (state.motionMode === mode) return;
  state = { ...state, motionMode: mode };
  persist();
  emit();
}

export function setMessageNotificationsEnabled(enabled: boolean): void {
  if (state.messageNotificationsEnabled === enabled) return;
  state = { ...state, messageNotificationsEnabled: enabled };
  persist();
  emit();
}

export function setMessageAutoReadEnabled(enabled: boolean): void {
  if (state.messageAutoReadEnabled === enabled) return;
  state = { ...state, messageAutoReadEnabled: enabled };
  persist();
  emit();
}

export function setSoundEnabled(enabled: boolean): void {
  if (state.soundEnabled === enabled) return;
  state = { ...state, soundEnabled: enabled };
  persist();
  emit();
}

export function useHudSettings(): HudSettings {
  return useSyncExternalStore(subscribeHudSettings, getHudSettings, getHudSettings);
}

/**
 * Resolves the effective reduced-motion preference: the settings override wins
 * when set, otherwise the OS `prefers-reduced-motion` signal (passed in so this
 * stays a pure helper testable without the media query).
 */
export function prefersReducedMotion(mode: MotionMode, systemReduced: boolean): boolean {
  if (mode === "reduced") return true;
  if (mode === "full") return false;
  return systemReduced;
}
