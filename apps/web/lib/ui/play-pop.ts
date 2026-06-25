let popAudio: HTMLAudioElement | null = null;

/**
 * Plays the soft "pop" cue used when switching feature tabs. Reuses a single
 * Audio element and rewinds it so rapid tab changes retrigger cleanly. Audio is
 * non-essential, so every failure path (autoplay block, decode error) is
 * swallowed silently.
 */
export function playPop(): void {
  if (typeof window === "undefined") return;
  try {
    if (!popAudio) {
      popAudio = new Audio("/pop.mp3");
      popAudio.volume = 0.35;
    }
    popAudio.currentTime = 0;
    void popAudio.play().catch(() => {});
  } catch {
    // ignore — audio is a nicety, never block navigation on it
  }
}
