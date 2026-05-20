"use client";

import { useEffect, useState, useCallback } from "react";
import {
  DEFAULT_VOICE_SETTINGS,
  VOICE_SETTINGS_KEY,
} from "@/lib/voice/constants";
import type { VoiceSettings } from "@/lib/voice/types";

/**
 * Phase 7 Plan 07-02 — voice settings hook.
 *
 * Single-user MVP: state lives in localStorage. ThemeToggle's mount-guard
 * pattern (ThemeToggle.tsx lines 30-46) is replicated to prevent SSR
 * hydration mismatch — server cannot see localStorage, so we render
 * DEFAULT_VOICE_SETTINGS until the useEffect fires post-mount.
 *
 * Plan 07-03 (JarvisListener) consumes this hook to know whether to start
 * Porcupine. Plan 07-04 (TTS pipeline) reads `voiceId` and `ttsProvider`.
 *
 * The `update` setter always persists immediately — no debounce, no
 * batching; single-user settings changes are rare and the write is cheap.
 *
 * No global stores (Zustand / Jotai / XState) — CLAUDE.md bans them for
 * the single-user MVP; useReducer / useState is the mandated pattern.
 */
export function useVoiceSettings() {
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_VOICE_SETTINGS);
  const [mounted, setMounted] = useState(false);

  // Read persisted settings from localStorage on first mount.
  // The SSR render (mounted=false) always returns DEFAULT_VOICE_SETTINGS to
  // avoid React hydration mismatch — window.localStorage is not available
  // server-side (or during the SSR render in client components).
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<VoiceSettings>;
        setSettings({ ...DEFAULT_VOICE_SETTINGS, ...parsed });
      }
    } catch (err) {
      console.warn(
        "[voice-settings] malformed localStorage entry; using defaults",
        err,
      );
      // Keep DEFAULT_VOICE_SETTINGS — no setSettings call needed since that
      // is already the initial state value.
    }
    setMounted(true);
  }, []);

  /**
   * Merge a partial patch into settings and immediately persist to localStorage.
   *
   * Called by VoiceSettingsSection (Plan 07-02) and by Plan 07-03's
   * JarvisListener (to update micDeviceId when the OS device list changes).
   */
  const update = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      try {
        window.localStorage.setItem(VOICE_SETTINGS_KEY, JSON.stringify(next));
      } catch (err) {
        // Storage quota exceeded — unlikely for small settings payload, but
        // don't crash the UI.
        console.warn("[voice-settings] localStorage write failed", err);
      }
      return next;
    });
  }, []);

  return { settings, mounted, update };
}
