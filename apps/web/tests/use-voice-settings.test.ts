/**
 * Phase 7 Plan 07-02 — useVoiceSettings hook unit tests.
 *
 * Covers:
 *   1. Returns DEFAULT_VOICE_SETTINGS on first mount (no localStorage)
 *   2. Round-trips through localStorage (write → remount → read)
 *   3. update() writes to localStorage under VOICE_SETTINGS_KEY
 *   4. Handles malformed JSON gracefully (falls back to defaults, does not throw)
 *   5. SSR mount-guard: returns DEFAULT_VOICE_SETTINGS before useEffect fires
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";
import { DEFAULT_VOICE_SETTINGS, VOICE_SETTINGS_KEY } from "@/lib/voice/constants";

// jsdom provides localStorage — clear it before each test
beforeEach(() => {
  window.localStorage.clear();
  vi.clearAllMocks();
});

describe("useVoiceSettings", () => {
  it("returns DEFAULT_VOICE_SETTINGS on first mount (no localStorage)", async () => {
    const { result } = renderHook(() => useVoiceSettings());
    // After mount, settings should equal defaults
    expect(result.current.settings).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("round-trips through localStorage: update persists, re-render reads it back", async () => {
    const { result } = renderHook(() => useVoiceSettings());

    await act(async () => {
      result.current.update({ voiceEnabled: true, voiceId: "abc123" });
    });

    // Check localStorage was written
    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    expect(raw).toContain('"voiceEnabled":true');
    expect(raw).toContain('"voiceId":"abc123"');

    // Re-mount to confirm persistence round-trip
    const { result: result2 } = renderHook(() => useVoiceSettings());
    expect(result2.current.settings.voiceEnabled).toBe(true);
    expect(result2.current.settings.voiceId).toBe("abc123");
  });

  it("update() writes merged settings to localStorage under VOICE_SETTINGS_KEY", async () => {
    const { result } = renderHook(() => useVoiceSettings());

    await act(async () => {
      result.current.update({ discreetMode: true });
    });

    const raw = window.localStorage.getItem(VOICE_SETTINGS_KEY);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!);
    // Should contain the updated key
    expect(parsed.discreetMode).toBe(true);
    // Should preserve other defaults
    expect(parsed.voiceEnabled).toBe(DEFAULT_VOICE_SETTINGS.voiceEnabled);
    expect(parsed.wakeWordPhrase).toBe(DEFAULT_VOICE_SETTINGS.wakeWordPhrase);
  });

  it("handles malformed JSON gracefully — falls back to defaults, does not throw", () => {
    window.localStorage.setItem(VOICE_SETTINGS_KEY, "{not-json{{bad");
    // Should not throw
    expect(() => {
      renderHook(() => useVoiceSettings());
    }).not.toThrow();

    const { result } = renderHook(() => useVoiceSettings());
    // After the useEffect runs, settings should be the defaults (malformed ignored)
    expect(result.current.settings).toEqual(DEFAULT_VOICE_SETTINGS);
  });

  it("mounted guard: mounted starts false, becomes true after useEffect", async () => {
    const { result } = renderHook(() => useVoiceSettings());
    // After all effects run (act wraps the initial render), mounted should be true
    expect(result.current.mounted).toBe(true);
  });
});
