let sendAudio: HTMLAudioElement | null = null;

/**
 * Plays the message-sent cue fired whenever the user dispatches a message to
 * JARVIS (the console composer, the Cmd+K dialog, the LifeOS quick-send).
 * Reuses a single Audio element and rewinds it so back-to-back sends retrigger
 * cleanly. Audio is non-essential, so every failure path (autoplay block,
 * decode error) is swallowed silently.
 */
export function playSend(): void {
  if (typeof window === "undefined") return;
  try {
    if (!sendAudio) {
      sendAudio = new Audio("/message-sent.mp3");
      sendAudio.volume = 0.4;
    }
    sendAudio.currentTime = 0;
    void sendAudio.play().catch(() => {});
  } catch {
    // ignore — audio is a nicety, never block sending on it
  }
}
