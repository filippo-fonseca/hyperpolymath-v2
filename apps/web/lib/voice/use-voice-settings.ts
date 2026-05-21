"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_SETTINGS_KEY,
} from "@/lib/voice/constants";
import type { VoiceSettings } from "@/lib/voice/types";

/**
 * Phase 7 — voice settings, shared across all useVoiceSettings() callers.
 *
 * Previously each hook instance held its own useState, so toggling discreet
 * mode from the header DiscreetToggleButton updated localStorage but not the
 * JarvisConsole's instance — and TTS still fired for muted typed input.
 *
 * Fix: module-level singleton + pub-sub. update() mutates the shared
 * `currentSettings` and notifies all subscribed components, which re-render
 * with the same state. Same pattern as mic-state-bus.ts; CLAUDE.md bans
 * Zustand/Jotai but allows plain module state + Set<>.
 *
 * `mounted` is still per-instance to keep the SSR hydration guard intact.
 */

let currentSettings: VoiceSettings = DEFAULT_VOICE_SETTINGS;
const subscribers = new Set<(s: VoiceSettings) => void>();

function hydrateFromStorage(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
      return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
    }
  } catch (err) {
    console.warn(
      "[voice-settings] malformed localStorage entry; using defaults",
      err,
    );
  }
  return DEFAULT_VOICE_SETTINGS;
}

function publish(next: VoiceSettings) {
  currentSettings = next;
  try {
    window.localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
  } catch (err) {
    console.warn("[voice-settings] localStorage write failed", err);
  }
  subscribers.forEach((fn) => fn(next));
}

/** Sync read for non-React code (e.g. JarvisListener callbacks). */
export function getCurrentVoiceSettings(): VoiceSettings {
  return currentSettings;
}

export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(currentSettings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Re-hydrate from localStorage on every mount. Cheap (JSON.parse of a
    // small object) and keeps the shared singleton in sync with whatever
    // another tab / component / test wrote last.
    currentSettings = hydrateFromStorage();
    setSettings(currentSettings);
    setMounted(true);

    const listener = (s: VoiceSettings) => setSettings(s);
    subscribers.add(listener);
    return () => {
      subscribers.delete(listener);
    };
  }, []);

  const update = useCallback((patch: Partial<VoiceSettings>) => {
    publish({ ...currentSettings, ...patch });
  }, []);

  return { settings, mounted, update };
}
