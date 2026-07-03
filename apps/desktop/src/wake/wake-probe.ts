// apps/desktop/src/wake/wake-probe.ts
// OPT-IN wake-phrase listener. While the app is IDLE (no conversation active)
// and the user has enabled wake mode in settings, it keeps a low-key mic loop
// running and periodically probes a rolling ~5s tail for the wake phrase
// "daddy's home". On a match it:
//   1. stops the wake loop (releases the cpal mic),
//   2. fires the injected trigger handler, which routes into the conversation
//      FSM's startConversation() — the SAME invoke path as the hotkey / tray /
//      button. That keeps the startup sequencer's once-per-session and
//      no-briefing-overlap guarantees intact for wake-triggered invokes.
//
// Probe reuse: this deliberately reuses the same probe POST plumbing as
// capture.ts — capture.probeBufferTail() encodes a WAV tail and POSTs it with
// `x-jarvis-probe: 1` (side-effect-free STT). The only wake-specific parts are
// the WAKE_PHRASE regex and that this loop owns its own cpal stream while
// idle instead of piggy-backing an active turn.
//
// Lifecycle wiring (who calls what):
//   - main.ts boot: setWakeTriggerHandler(() => startConversation()), then
//     setWakeEnabled(settings.wakeEnabled). The settings-pane toggle calls
//     setWakeEnabled live — no restart needed in either direction.
//   - conversation/state-machine.ts: stopWakeLoop() when a conversation opens
//     (any invoke path), resumeWakeLoopIfIdle() when the FSM returns to idle.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { isCaptureActive, probeBufferTail } from "@/audio/capture";

// Built-in "Daddy's home" — matches with or without the apostrophe. This stays
// a special-cased BUILT-IN (→ startConversation, the session-start sequence),
// NOT a stored routine: it must work with zero routines / server unreachable,
// and it maps to opening a conversation, not to running a block list.
const WAKE_PHRASE = /\bdaddy'?s\s+home\b/i;
const WAKE_PROBE_INTERVAL_MS = 2_200;
// Rolling buffer cap. probeBufferTail only transcribes the last ~5s, so keep
// ~6s and drop older chunks — the idle loop can run for hours and must not
// accumulate audio unboundedly (the retired 2026-06 version leaked here).
const ROLLING_MAX_SAMPLES = 16_000 * 6;

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

let enabled = false;
let running = false;
let unlisten: UnlistenFn | null = null;
let probeTimer: ReturnType<typeof setInterval> | null = null;
let probeInFlight = false;
// Set while we're tearing down the loop to hand off to the FSM, so a late
// probe result can't re-trigger.
let triggering = false;

// Rolling PCM tail (16 kHz mono chunks straight off the cpal IPC event).
let chunks: Float32Array[] = [];
let totalSamples = 0;

function pushChunk(chunk: Float32Array): void {
  chunks.push(chunk);
  totalSamples += chunk.length;
  // Trim from the front while we can drop a whole chunk and still keep the cap.
  while (chunks.length > 1 && totalSamples - (chunks[0]?.length ?? 0) >= ROLLING_MAX_SAMPLES) {
    totalSamples -= chunks[0]?.length ?? 0;
    chunks.shift();
  }
}

function snapshotBuffer(): Float32Array {
  const out = new Float32Array(totalSamples);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function resetBuffer(): void {
  chunks = [];
  totalSamples = 0;
}

// Injected by main.ts (→ conversation FSM's startConversation) to avoid a
// module cycle: state-machine.ts imports this module for stop/resume, so this
// module must not import state-machine.ts back. Same pattern as
// sse-client.setTriggerHandler.
let triggerHandler: (() => void) | null = null;

/** Inject the on-wake-phrase handler (main.ts wires startConversation). */
export function setWakeTriggerHandler(fn: () => void): void {
  triggerHandler = fn;
}

// Injected routine dispatch (main.ts wires the registry). The matcher scans
// the routine phrase table (wake + utterance triggers) and returns a matched
// routineId or null; the fire handler runs that routine's blocks. Kept as
// injection seams so this module never imports the registry (which imports
// this module for stopWakeLoop — avoids a cycle). hasPhrase lets the idle
// loop run whenever phrase routines exist, even if the legacy wake toggle is
// off (authoring a phrase routine is itself the opt-in to the green mic).
let phraseMatcher: ((text: string) => string | null) | null = null;
let routineFireHandler: ((routineId: string, type: "wake" | "utterance") => void) | null = null;
let hasPhrase: (() => boolean) | null = null;

/** Inject the routine phrase matcher (registry.matchPhrase). */
export function setPhraseMatcher(fn: (text: string) => string | null): void {
  phraseMatcher = fn;
}

/** Inject the routine fire handler (→ registry.fireRoutine). */
export function setRoutineFireHandler(
  fn: (routineId: string, type: "wake" | "utterance") => void,
): void {
  routineFireHandler = fn;
}

/** Inject the "any phrase routines exist?" predicate (registry.hasPhraseTriggers). */
export function setHasPhraseTriggers(fn: () => boolean): void {
  hasPhrase = fn;
}

/** True when the idle mic loop should run: legacy wake toggle OR phrase routines. */
function shouldRunIdleLoop(): boolean {
  return enabled || (hasPhrase?.() ?? false);
}

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

/**
 * Enable/disable the wake feature entirely — the LIVE toggle surface. Called
 * from boot() with the persisted setting and from the settings pane on every
 * flip; takes effect immediately (no app restart):
 *   ON  → the idle listener starts now (unless a turn owns the mic, in which
 *         case the FSM's return-to-idle resume picks it up),
 *   OFF → the loop is torn down and the cpal mic released (macOS green-dot
 *         goes away), and it will not auto-restart.
 */
export function setWakeEnabled(on: boolean): void {
  if (enabled === on) return;
  enabled = on;
  if (on) {
    void startWakeLoop().then(() => {
      if (running) {
        // eslint-disable-next-line no-console
        console.log("[wake] enabled — idle listener started");
      } else {
        // eslint-disable-next-line no-console
        console.log("[wake] enabled — idle listener deferred (turn active); resumes on idle");
      }
    });
  } else if (!(hasPhrase?.() ?? false)) {
    // Only tear the mic down when NO phrase routine still needs the idle loop.
    void stopWakeLoop().then(() => {
      // eslint-disable-next-line no-console
      console.log("[wake] disabled — idle listener stopped");
    });
  } else {
    // eslint-disable-next-line no-console
    console.log("[wake] toggle off but phrase routines active — idle loop kept");
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
  if (!shouldRunIdleLoop() || running || triggering) return;
  if (isCaptureActive()) return;

  running = true;
  emitWakeState(true);
  resetBuffer();

  unlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
    if (!running) return;
    pushChunk(new Float32Array(event.payload.samples));
  });

  await invoke("start_capture");

  probeTimer = setInterval(() => {
    void runWakeProbe();
  }, WAKE_PROBE_INTERVAL_MS);

  // eslint-disable-next-line no-console
  console.log("[wake] idle wake loop listening for 'daddy's home'");
}

async function runWakeProbe(): Promise<void> {
  if (probeInFlight || triggering || !running) return;
  const tail = snapshotBuffer();
  probeInFlight = true;
  try {
    const text = await probeBufferTail(tail);
    if (!text || !running || triggering) return;

    // Routine phrases (wake + utterance triggers) match FIRST; a routine
    // phrase runs that routine's blocks. If none match, fall back to the
    // built-in "Daddy's home" → startConversation. One idle probe, two targets.
    const routineId = phraseMatcher?.(text) ?? null;
    if (routineId && routineFireHandler) {
      // eslint-disable-next-line no-console
      console.log(`[wake] routine phrase matched — firing ${routineId}`);
      triggering = true;
      // Release the mic FIRST so the routine's spoken block results own the
      // stream and can't feed back into the idle probe.
      await stopWakeLoop();
      try {
        routineFireHandler(routineId, "wake");
      } finally {
        triggering = false;
      }
      return;
    }

    if (WAKE_PHRASE.test(text)) {
      // eslint-disable-next-line no-console
      console.log("[wake] 'daddy's home' detected — invoking JARVIS");
      triggering = true;
      // Release the mic FIRST so the FSM's capture turn owns the cpal stream,
      // then hand off through the shared invoke path (startConversation).
      await stopWakeLoop();
      try {
        triggerHandler?.();
      } finally {
        triggering = false;
      }
    }
  } catch {
    // best-effort; ignore probe errors
  } finally {
    probeInFlight = false;
  }
}

/**
 * Stop the wake loop and release the cpal mic. Safe to call when not running.
 * Does NOT clear `enabled` — the loop can be resumed later (state-machine
 * calls resumeWakeLoopIfIdle when the FSM returns to idle).
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
  resetBuffer();
  if (running) {
    running = false;
    emitWakeState(false);
    // Release the mic. A command turn (if it's what stopped us) re-invokes
    // start_capture itself; stop_capture is idempotent on the Rust side.
    await invoke("stop_capture");
    // eslint-disable-next-line no-console
    console.log("[wake] idle wake loop paused — mic released");
  }
}

/**
 * Restart the wake loop if the app is idle again and the feature is enabled.
 * The conversation FSM calls this after every return to idle so hands-free
 * wake resumes between conversations.
 */
export async function resumeWakeLoopIfIdle(): Promise<void> {
  if (!shouldRunIdleLoop() || running || triggering) return;
  if (isCaptureActive()) return;
  await startWakeLoop();
}

/**
 * Re-evaluate whether the idle loop should be running after the routine phrase
 * table changed (a phrase routine was added/removed). Starts the loop if phrase
 * routines now exist and nothing else owns the mic; the legacy wake toggle and
 * the FSM's own resume calls still govern the toggle-driven case. No-op when a
 * turn is active (the FSM's return-to-idle resume picks it up).
 */
export async function refreshIdleLoopForPhrases(): Promise<void> {
  if (running || triggering || isCaptureActive()) return;
  if (shouldRunIdleLoop()) await startWakeLoop();
}
