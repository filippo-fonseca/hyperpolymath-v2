// apps/desktop/src/wake/wake-probe.ts
// Always-on wake-phrase listener. While the app is IDLE (no command turn
// active) it keeps a low-key mic loop running and periodically probes a rolling
// ~5s tail for the wake phrase "daddy's home". On a match it:
//   1. stops the wake loop (releases the cpal mic),
//   2. runs the proactive briefing,
//   3. starts a normal command turn so the user can immediately speak a command
//      (JARVIS-style: greeting → briefing → "what can I do for you, sir?").
//
// Probe reuse: this deliberately reuses the SAME probe POST that capture.ts
// uses for the "Done, JARVIS" stop phrase. The encode-WAV + POST-with-
// x-jarvis-probe logic lives once in capture.probeBufferTail(); both the
// in-turn stop-phrase probe and this idle wake probe call it. The only thing
// that differs is the regex (WAKE_PHRASE vs STOP_PHRASE) and that this loop
// owns its own cpal stream while idle instead of piggy-backing an active turn.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isCaptureActive, probeBufferTail, startCaptureTurn } from "@/audio/capture";
import { VAD_DEFAULTS, VadSilenceDetector } from "@/audio/vad";
import { runBriefing } from "@/briefing/briefing";

// "Daddy's home" — matches with or without the apostrophe.
const WAKE_PHRASE = /\bdaddy'?s\s+home\b/i;
const WAKE_PROBE_INTERVAL_MS = 2_200;

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

let enabled = false;
let running = false;
let unlisten: UnlistenFn | null = null;
let vad: VadSilenceDetector | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probeInFlight = false;
// Set while we're tearing down the loop to run the briefing, so a late probe
// can't re-trigger.
let triggering = false;

type WakeStateListener = (active: boolean) => void;
const wakeStateListeners = new Set<WakeStateListener>();

/** Subscribe to wake-loop active/paused transitions (for HUD cues). */
export function onWakeState(fn: WakeStateListener): () => void {
  wakeStateListeners.add(fn);
  fn(running);
  return () => {
    wakeStateListeners.delete(fn);
  };
}

function emitWakeState(active: boolean): void {
  for (const fn of wakeStateListeners) fn(active);
}

/** Enable/disable the wake feature entirely. When disabled the loop is stopped
 *  and will not auto-restart. Called from boot() based on the wake.enabled
 *  setting, and could be wired to a settings toggle. */
export function setWakeEnabled(on: boolean): void {
  enabled = on;
  if (on) {
    void startWakeLoop();
  } else {
    void stopWakeLoop();
  }
}

export function isWakeEnabled(): boolean {
  return enabled;
}

/**
 * Start the idle wake loop. Idempotent. No-op when disabled, when a command
 * turn is already active, or when a trigger is mid-flight — in those cases the
 * loop restarts later via resumeWakeLoopIfIdle().
 */
export async function startWakeLoop(): Promise<void> {
  if (!enabled || running || triggering) return;
  if (isCaptureActive()) return;

  running = true;
  emitWakeState(true);

  // Buffer-only accumulator — the VAD silence/hard-cap return values are
  // ignored here exactly like in capture.ts; we just want a rolling buffer.
  vad = new VadSilenceDetector({ ...VAD_DEFAULTS });
  vad.start();

  unlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
    if (!vad) return;
    vad.push(new Float32Array(event.payload.samples));
  });

  await invoke("start_capture");

  probeTimer = setInterval(() => {
    void runWakeProbe();
  }, WAKE_PROBE_INTERVAL_MS);

  // eslint-disable-next-line no-console
  console.log("[wake] idle wake loop listening for 'daddy's home'");
}

async function runWakeProbe(): Promise<void> {
  if (probeInFlight || triggering || !vad || !running) return;
  const full = vad.flush();
  probeInFlight = true;
  try {
    const text = await probeBufferTail(full);
    if (text && WAKE_PHRASE.test(text) && running && !triggering) {
      // eslint-disable-next-line no-console
      console.log("[wake] 'daddy's home' detected — briefing then opening a turn");
      triggering = true;
      await stopWakeLoop();
      await runBriefing();
      // Hand off to a normal command turn so the user can speak immediately.
      await startCaptureTurn();
      triggering = false;
    }
  } catch {
    // best-effort; ignore probe errors
  } finally {
    probeInFlight = false;
  }
}

/**
 * Stop the wake loop and release the cpal mic. Safe to call when not running.
 * Does NOT clear `enabled` — the loop can be resumed later.
 */
export async function stopWakeLoop(): Promise<void> {
  if (probeTimer) {
    clearInterval(probeTimer);
    probeTimer = null;
  }
  if (unlisten) {
    unlisten();
    unlisten = null;
  }
  vad = null;
  if (running) {
    running = false;
    emitWakeState(false);
    // Release the mic. A command turn (if it's what stopped us) re-invokes
    // start_capture itself; stop_capture is idempotent on the Rust side.
    await invoke("stop_capture");
  }
}

/**
 * Restart the wake loop if the app is idle again and the feature is enabled.
 * Call this after a command turn finishes so hands-free wake resumes.
 */
export async function resumeWakeLoopIfIdle(): Promise<void> {
  if (!enabled || running || triggering) return;
  if (isCaptureActive()) return;
  await startWakeLoop();
}
