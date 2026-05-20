"use client";

import { useEffect } from "react";

/**
 * Phase 7 Plan 07-03 — Cmd+Shift+J press-to-talk (VOICE-09).
 *
 * CRITICAL_PHASE7_CONCERNS #10: this hook MUST fire even when
 * Discreet mode is active. Discreet silences TTS + wake-word, but
 * the keyboard shortcut is the user's explicit "I want voice right
 * now" path. Therefore the consumer (JarvisListener) gates ONLY on
 * voiceEnabled, NOT on discreetMode.
 *
 * Uses code === 'KeyJ' (not key === 'j') so it works across keyboard
 * layouts and IME states.
 *
 * Supports both Cmd (macOS, metaKey) and Ctrl (Windows/Linux, ctrlKey)
 * for cross-platform compatibility.
 */
export function usePressToTalk(enabled: boolean, onPress: () => void) {
  useEffect(() => {
    if (!enabled) return;

    function handler(e: KeyboardEvent) {
      const cmdOrCtrl = e.metaKey || e.ctrlKey;
      if (cmdOrCtrl && e.shiftKey && e.code === "KeyJ") {
        e.preventDefault();
        onPress();
      }
    }

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enabled, onPress]);
}
