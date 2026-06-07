"use client";

import { useEffect } from "react";

import { getSharedAudioContext, unlockAudioContext } from "@/lib/voice/audio-context";
import { useTtsPlayer } from "@/lib/voice/use-tts-player";
import { useVoiceSettings } from "@/lib/voice/use-voice-settings";

/**
 * Mounted by JarvisListenerMount when the desktop daemon owns the mic
 * (desktopClaimed === true). Subscribes to `jarvis-voice-speak-sentence`
 * events emitted by GlobalJarvisHandler / JarvisConsole so JARVIS can still
 * TALK BACK even though the browser does not own the mic.
 *
 * Stripped-down sibling of PhysicalExtensionRecorder/JarvisListener's TTS
 * blocks — no getUserMedia, no MediaRecorder, no VAD, no FSM dispatch.
 * Just the AudioContext unlock + sentence player.
 *
 * Follow-up window (the wake-fire dispatch the other components do at TTS
 * end) is intentionally omitted: the user is talking through the desktop,
 * not the browser, so re-acquiring the browser mic would be wrong. The
 * desktop's own follow-up flow (future work) handles continued conversation.
 */
export function JarvisVoicePlayer() {
  const { settings } = useVoiceSettings();
  const ttsPlayer = useTtsPlayer();

  useEffect(() => {
    if (!settings.voiceEnabled) return;
    if (getSharedAudioContext()) return;

    let unlocked = false;
    const unlock = () => {
      if (unlocked) return;
      unlocked = true;
      void unlockAudioContext().catch(() => {});
    };
    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
    return () => {
      window.removeEventListener("click", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, [settings.voiceEnabled]);

  useEffect(() => {
    const handleSentence = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          text: string;
          seq: number;
          voiceId?: string;
        }>
      ).detail;
      if (!detail?.text?.trim()) return;

      const audioContext = getSharedAudioContext();
      const silent =
        !audioContext ||
        settings.discreetMode ||
        settings.ttsProvider === "off";
      if (silent) return;

      ttsPlayer.playSentence(detail.text, detail.seq, {
        voiceId: detail.voiceId ?? settings.voiceId,
        ttsProvider: settings.ttsProvider,
        audioContext,
        onStart: () => {},
        onEnd: () => {},
      });
    };

    window.addEventListener("jarvis-voice-speak-sentence", handleSentence);
    return () =>
      window.removeEventListener("jarvis-voice-speak-sentence", handleSentence);
  }, [settings.discreetMode, settings.ttsProvider, settings.voiceId, ttsPlayer]);

  return null;
}
