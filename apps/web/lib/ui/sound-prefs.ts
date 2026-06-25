import { useSyncExternalStore } from "react";

/**
 * Sound-effects mute preference. Pure client UI nicety (the send cue, tab pop,
 * and JARVIS reply chime), so it lives in localStorage rather than the DB — no
 * round trip, no migration, and it gates audio before any server data loads.
 *
 * `playSend` / `playPop` / `playReply` read isSfxMuted() before playing; the
 * sidebar toggle writes it via setSfxMuted, which fires a window event so any
 * mounted toggle re-renders in sync.
 */
const STORAGE_KEY = "hp:sfx-muted";
const EVENT = "hp:sfx-muted-change";

export function isSfxMuted(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSfxMuted(muted: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, muted ? "1" : "0");
    window.dispatchEvent(new Event(EVENT));
  } catch {
    // ignore — a blocked localStorage just means the pref doesn't persist
  }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** React binding for the mute pref. SSR-safe: server snapshot is always false. */
export function useSfxMuted(): boolean {
  return useSyncExternalStore(subscribe, isSfxMuted, () => false);
}
