// apps/desktop/src/audio/capture.ts
// Orchestrates a single capture turn:
//   1. POST claim (belt-and-braces alongside the persistent 10s heartbeat in main.ts)
//   2. Register audio-chunk event listener
//   3. invoke("start_capture") → Rust opens cpal stream
//   4. Feed chunks to VadSilenceDetector
//   5. On VAD end-of-speech (or user cancel): stop capture, encode WAV, POST to /voice/transcript
//
// Cancel: if the user clicks Cancel during a turn, the captured audio is
// discarded — no transcript POST, nothing reaches the web app.
//
// Extend: a manual "keep mic open" toggle (hotkey Ctrl+Option+E). When ON,
// VAD silence-end + hard-cap are both suppressed. Toggle OFF to release —
// the captured buffer is sent immediately (acts as a manual end-of-turn).

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { postClaim, postTranscript } from "@/api/client";
import { encodeWav } from "@/audio/encode-wav";
import { VAD_DEFAULTS, VadSilenceDetector } from "@/audio/vad";

// ─── Invoke-to-talk capture model (VAD auto-ends the turn) ──────────────────
// A turn opens on ⌘⌃J / tray / the FSM, and AUTO-ENDS on ~800ms of VAD silence
// (or the per-utterance hard cap). Brief pauses within the grace window don't
// end the turn. The old open-mic model that ignored VAD end-of-speech (and the
// "Done, JARVIS" cloud-probe stop phrase) has been removed — VAD ends turns now.
//
// The manual "extend" path is kept intact: while `extended` is true (manual
// mode / ⌘⌃E hold), VAD end-of-speech is suppressed and only the ⌘⌃J toggle,
// the extend release, or the safety backstop end the turn.

// Safety backstop so a forgotten-open mic (only reachable via manual/extend
// mode) can't run away. Sits just above the VAD hardCapMs (15s) so in the
// normal conversational path VAD always ends the turn first.
const SAFETY_CAP_MS = 20_000;

let safetyTimer: ReturnType<typeof setTimeout> | null = null;

function teardownTurnTimers(): void {
  if (safetyTimer) {
    clearTimeout(safetyTimer);
    safetyTimer = null;
  }
}

// Live-mutable VAD params — `main.ts` calls `setVadSilenceMs` when the user
// adjusts the Settings "Silence wait" dropdown so the next capture turn
// picks up the new value without restarting the daemon.
let vadSilenceMs = VAD_DEFAULTS.silenceEndMs;
export function setVadSilenceMs(ms: number): void {
  vadSilenceMs = ms;
}

// Manual mode — when true, every turn starts in extend mode (VAD silence +
// hard cap suppressed). Only the manual-mode toggle (set to false) OR the
// ⌘⌃E shortcut closes the mic. Persisted as `capture.manualMode`.
let manualMode = false;

type ManualModeListener = (active: boolean) => void;
const manualModeListeners = new Set<ManualModeListener>();

export function onManualModeChange(fn: ManualModeListener): () => void {
  manualModeListeners.add(fn);
  fn(manualMode);
  return () => {
    manualModeListeners.delete(fn);
  };
}

function emitManualMode(active: boolean): void {
  for (const fn of manualModeListeners) fn(active);
}

/** Toggle manual mode. If currently recording AND turning OFF, flush the
 *  active buffer immediately (acts as a "send" — the user has signaled
 *  end-of-turn by exiting manual mode). */
export function setManualMode(active: boolean): void {
  if (manualMode === active) return;
  manualMode = active;
  emitManualMode(active);
  if (!active && currentState === "recording" && extended && activeVad && !activeTurnFinished) {
    extended = false;
    emitExtended(false);
    activeTurnFinished = true;
    void finishTurn(activeVad);
  } else if (active && currentState === "recording" && !extended) {
    // Mid-turn enable: keep the current turn open from here on.
    extended = true;
    emitExtended(true);
  }
}

export function isManualMode(): boolean {
  return manualMode;
}

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

export type CaptureState = "idle" | "recording" | "uploading";
type StateListener = (state: CaptureState) => void;
type TranscriptListener = (text: string) => void;
type ExtendedListener = (active: boolean) => void;

const stateListeners = new Set<StateListener>();
const transcriptListeners = new Set<TranscriptListener>();
const extendedListeners = new Set<ExtendedListener>();

let currentState: CaptureState = "idle";
let activeUnlisten: UnlistenFn | null = null;
let cancelled = false;

// Extend mode — when true, audio-chunk listener ignores VAD end-of-speech.
// Set via toggleExtended() from the Ctrl+Option+E global shortcut OR from
// an Extend button in the UI. Reset to false on every turn boundary.
let extended = false;

// Hoisted so toggleExtended can reach into the active turn.
let activeVad: VadSilenceDetector | null = null;
let activeTurnFinished = false;

function setState(next: CaptureState): void {
  currentState = next;
  for (const fn of stateListeners) fn(next);
}

function emitExtended(active: boolean): void {
  for (const fn of extendedListeners) fn(active);
}

export function onCaptureState(fn: StateListener): () => void {
  stateListeners.add(fn);
  fn(currentState);
  return () => {
    stateListeners.delete(fn);
  };
}

export function onTranscriptReceived(fn: TranscriptListener): () => void {
  transcriptListeners.add(fn);
  return () => {
    transcriptListeners.delete(fn);
  };
}

export function onExtendedChange(fn: ExtendedListener): () => void {
  extendedListeners.add(fn);
  fn(extended);
  return () => {
    extendedListeners.delete(fn);
  };
}

/**
 * Start a capture turn. Idempotent — calling while a turn is active is a no-op.
 * Called by the SSE subscriber on every `trigger` event (or by the global
 * keyboard hotkey when PE mode is off).
 */
export async function startCaptureTurn(): Promise<void> {
  if (activeUnlisten) {
    // eslint-disable-next-line no-console
    console.log("[capture] already recording — ignoring re-trigger");
    return;
  }
  cancelled = false;
  // Conversational turn: VAD auto-ends on silence. `extended` starts from the
  // manual-mode flag — when the user has manual mode on, the turn is held open
  // and VAD end-of-speech is suppressed (only ⌘⌃J / extend-release / the safety
  // backstop end it).
  extended = manualMode;
  emitExtended(extended);
  activeTurnFinished = false;

  await postClaim();

  activeVad = new VadSilenceDetector({ ...VAD_DEFAULTS, silenceEndMs: vadSilenceMs });
  activeVad.start();

  activeUnlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
    if (activeTurnFinished || !activeVad) return;
    const chunk = new Float32Array(event.payload.samples);
    // Honor VAD end-of-speech: push() returns true on silence-end or hard cap.
    // In extend/manual mode we buffer only and ignore the end signal.
    const ended = activeVad.push(chunk);
    if (ended && !extended && !activeTurnFinished) {
      // eslint-disable-next-line no-console
      console.log("[capture] VAD end-of-speech — finishing turn");
      activeTurnFinished = true;
      void finishTurn(activeVad);
    }
  });

  await invoke("start_capture");
  setState("recording");

  // Safety backstop — unconditional end-of-turn so a forgotten mic (manual mode)
  // can't run away. VAD ends normal turns well before this fires.
  teardownTurnTimers();
  safetyTimer = setTimeout(() => {
    if (!activeTurnFinished && activeVad) {
      // eslint-disable-next-line no-console
      console.log("[capture] safety cap reached — finishing turn");
      activeTurnFinished = true;
      void finishTurn(activeVad);
    }
  }, SAFETY_CAP_MS);
}

/**
 * Single control for the Cmd+Ctrl+J chord (and the wake button): start a turn
 * when idle, or end-and-send the current turn when recording. The same chord
 * stops in BOTH hotkey mode and physical-extender mode.
 */
export async function toggleCaptureTurn(): Promise<void> {
  if (currentState === "idle") {
    await startCaptureTurn();
    return;
  }
  if (currentState === "recording" && !activeTurnFinished && activeVad) {
    // eslint-disable-next-line no-console
    console.log("[capture] toggle stop — finishing turn");
    activeTurnFinished = true;
    void finishTurn(activeVad);
  }
  // uploading: ignore — the turn is already on its way.
}

/**
 * Toggle extend mode. Only meaningful during an active recording.
 *
 *   Press 1 (recording, not extended) → extended ON. VAD silence + hard cap
 *     are now suppressed. The mic stays open until either the user toggles
 *     extend OFF, or cancels.
 *   Press 2 (recording, extended)     → extended OFF. The current buffer is
 *     sent immediately as the end-of-turn (manual end-of-speech).
 *   Press while idle / uploading      → no-op.
 */
export function toggleExtended(): void {
  if (currentState !== "recording") {
    // eslint-disable-next-line no-console
    console.log("[capture] toggleExtended ignored — not recording");
    return;
  }
  if (extended) {
    // Releasing extend → fire end-of-turn immediately.
    extended = false;
    emitExtended(false);
    if (!activeTurnFinished && activeVad) {
      activeTurnFinished = true;
      // eslint-disable-next-line no-console
      console.log("[capture] extend released — flushing buffer");
      void finishTurn(activeVad);
    }
    return;
  }
  extended = true;
  emitExtended(true);
  // eslint-disable-next-line no-console
  console.log("[capture] extend ON — VAD silence + hard cap suppressed");
}

/**
 * User-initiated cancel. Stops the cpal stream and discards captured audio.
 * No transcript POST — nothing reaches the web app.
 */
export async function cancelCaptureTurn(): Promise<void> {
  if (currentState === "idle") return;
  cancelled = true;
  teardownTurnTimers();
  extended = false;
  emitExtended(false);
  if (activeUnlisten) {
    activeUnlisten();
    activeUnlisten = null;
  }
  await invoke("stop_capture");
  activeVad = null;
  setState("idle");
  // eslint-disable-next-line no-console
  console.log("[capture] cancelled by user — no transcript will be sent");
}

async function finishTurn(vad: VadSilenceDetector): Promise<void> {
  teardownTurnTimers();
  const vadEndAt = Date.now();
  await stopCaptureTurn();

  if (cancelled) {
    activeVad = null;
    extended = false;
    emitExtended(false);
    setState("idle");
    return;
  }

  const samples = vad.flush();
  if (samples.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[capture] no audio captured — silent drop");
    activeVad = null;
    extended = false;
    emitExtended(false);
    setState("idle");
    return;
  }

  setState("uploading");
  const wav = encodeWav(samples, 16_000);
  const result = await postTranscript({ wav, vadEndAt });
  if (result) {
    // eslint-disable-next-line no-console
    console.log(
      `[capture] transcript received (sttDoneAt=${result.sttDoneAt}): ${result.transcript.slice(0, 80)}`,
    );
    for (const fn of transcriptListeners) fn(result.transcript);
  }
  activeVad = null;
  extended = false;
  emitExtended(false);
  setState("idle");
}

/**
 * Stop the active capture turn.
 * Unregisters the audio-chunk listener and tells Rust to close the cpal stream.
 */
export async function stopCaptureTurn(): Promise<void> {
  if (activeUnlisten) {
    activeUnlisten();
    activeUnlisten = null;
  }
  await invoke("stop_capture");
}
