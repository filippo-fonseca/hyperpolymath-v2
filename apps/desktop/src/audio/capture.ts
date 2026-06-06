// apps/desktop/src/audio/capture.ts
// Orchestrates a single capture turn:
//   1. POST claim (belt-and-braces alongside the persistent 10s heartbeat in main.ts)
//   2. Register audio-chunk event listener
//   3. invoke("start_capture") → Rust opens cpal stream
//   4. Feed chunks to VadSilenceDetector
//   5. On VAD end-of-speech (or user cancel): stop capture, encode WAV, POST to /voice/transcript
//
// Cancel: if the user clicks Cancel during a turn, the captured audio is
// discarded — no transcript POST, nothing reaches the web app. This is the
// safety valve for misfires or accidental wake events.

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

import { postClaim, postTranscript } from "@/api/client";
import { encodeWav } from "@/audio/encode-wav";
import { VAD_DEFAULTS, VadSilenceDetector } from "@/audio/vad";

// Live-mutable VAD params — `main.ts` calls `setVadSilenceMs` when the user
// adjusts the Settings "Silence wait" dropdown so the next capture turn
// picks up the new value without restarting the daemon.
let vadSilenceMs = VAD_DEFAULTS.silenceEndMs;
export function setVadSilenceMs(ms: number): void {
  vadSilenceMs = ms;
}

interface AudioChunkPayload {
  samples: number[];
  sample_rate: number;
}

export type CaptureState = "idle" | "recording" | "uploading";
type StateListener = (state: CaptureState) => void;
type TranscriptListener = (text: string) => void;

const stateListeners = new Set<StateListener>();
const transcriptListeners = new Set<TranscriptListener>();

let currentState: CaptureState = "idle";
let activeUnlisten: UnlistenFn | null = null;
let cancelled = false;

function setState(next: CaptureState): void {
  currentState = next;
  for (const fn of stateListeners) fn(next);
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

/**
 * Start a capture turn. Idempotent — calling while a turn is active is a no-op.
 * Called by the SSE subscriber on every `trigger` event.
 */
export async function startCaptureTurn(): Promise<void> {
  if (activeUnlisten) {
    // eslint-disable-next-line no-console
    console.log("[capture] already recording — ignoring re-trigger");
    return;
  }
  cancelled = false;

  await postClaim();

  const vad = new VadSilenceDetector({ ...VAD_DEFAULTS, silenceEndMs: vadSilenceMs });
  vad.start();

  let finished = false;

  activeUnlisten = await listen<AudioChunkPayload>("audio-chunk", (event) => {
    if (finished) return;
    const chunk = new Float32Array(event.payload.samples);
    const ended = vad.push(chunk);
    if (ended) {
      finished = true;
      void finishTurn(vad);
    }
  });

  await invoke("start_capture");
  setState("recording");
}

/**
 * User-initiated cancel. Stops the cpal stream and discards captured audio.
 * No transcript POST — nothing reaches the web app.
 */
export async function cancelCaptureTurn(): Promise<void> {
  if (currentState === "idle") return;
  cancelled = true;
  if (activeUnlisten) {
    activeUnlisten();
    activeUnlisten = null;
  }
  await invoke("stop_capture");
  setState("idle");
  // eslint-disable-next-line no-console
  console.log("[capture] cancelled by user — no transcript will be sent");
}

async function finishTurn(vad: VadSilenceDetector): Promise<void> {
  const vadEndAt = Date.now();
  await stopCaptureTurn();

  if (cancelled) {
    setState("idle");
    return;
  }

  const samples = vad.flush();
  if (samples.length === 0) {
    // eslint-disable-next-line no-console
    console.log("[capture] no audio captured — silent drop");
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
