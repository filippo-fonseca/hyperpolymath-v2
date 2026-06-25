import { isSfxMuted } from "@/lib/ui/sound-prefs";

let replyAudio: HTMLAudioElement | null = null;

/**
 * Plays the notification cue when JARVIS finishes answering a typed turn. Fired
 * from the stream client's `done` handler (skipped for voice turns, where TTS
 * already speaks the reply). Reuses a single Audio element and rewinds it.
 * Audio is non-essential, so every failure path is swallowed silently.
 */
export function playReply(): void {
  if (typeof window === "undefined") return;
  if (isSfxMuted()) return;
  try {
    if (!replyAudio) {
      replyAudio = new Audio("/jarvis-reply.mp3");
      replyAudio.volume = 0.4;
    }
    replyAudio.currentTime = 0;
    void replyAudio.play().catch(() => {});
  } catch {
    // ignore — audio is a nicety, never block on it
  }
}
