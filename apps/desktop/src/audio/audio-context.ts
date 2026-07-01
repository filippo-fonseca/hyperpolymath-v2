// apps/desktop/src/audio/audio-context.ts
// A single, app-lifetime AudioContext for all TTS playback.
//
// Root cause of the "JARVIS is silent hands-free" bug: TtsPlayer used to create
// a `new AudioContext()` lazily on the first sentence and never resumed it. In
// WKWebView an AudioContext created outside a user gesture starts `suspended`,
// so nothing ever played. (RESEARCH Q1.)
//
// Fix: create ONE context eagerly at boot and resume it. WebKit lifts its
// autoplay restriction whenever a getUserMedia/mic capture is active, and the
// app opens the mic on every turn — so `resume()` succeeds hands-free. The
// gesture prime (first pointerdown/keydown) and the visibilitychange recovery
// are belt-and-braces.

const SAMPLE_RATE = 24_000; // matches the server PCM output (pcm_24000)

let ctx: AudioContext | null = null;

/**
 * Get the one shared AudioContext, creating it on first call. Never creates a
 * second context for the app's lifetime.
 */
export function getSharedAudioContext(): AudioContext {
  if (!ctx) {
    ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  }
  return ctx;
}

/**
 * Resume the shared context if it is not already running. Safe to call
 * repeatedly and from anywhere; all errors are swallowed (a suspended context
 * that can't yet resume is not fatal — the next call will retry).
 */
export async function resumeSharedAudioContext(): Promise<void> {
  const c = getSharedAudioContext();
  if (c.state === "running") return;
  try {
    await c.resume();
  } catch {
    // Autoplay policy may still block resume() if there's no active capture and
    // no gesture yet. The gesture prime + the mic-open-during-turn both retry.
  }
}

let gesturePrimed = false;

/**
 * Once, on the first pointerdown/keydown anywhere in the document, resume the
 * shared context. This is the fallback path for the very first briefing before
 * any mic capture has opened (RESEARCH Q1 step 2).
 */
export function primeAudioOnGesture(): void {
  if (gesturePrimed) return;
  gesturePrimed = true;
  const prime = (): void => {
    void resumeSharedAudioContext();
  };
  document.addEventListener("pointerdown", prime, { once: true });
  document.addEventListener("keydown", prime, { once: true });
}

let visibilityWired = false;

/**
 * WKWebView suspends the AudioContext when the window is backgrounded and does
 * not always resume it on foreground. On returning to `visible`, bounce the
 * context (suspend → resume ~75ms apart) to recover audible playback
 * (RESEARCH Q1 step 5). Wired once.
 */
export function wireVisibilityRecovery(): void {
  if (visibilityWired) return;
  visibilityWired = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const c = getSharedAudioContext();
    void (async () => {
      try {
        await c.suspend();
      } catch {
        // ignore — recovery is best-effort
      }
      await new Promise((r) => setTimeout(r, 75));
      await resumeSharedAudioContext();
    })();
  });
}
