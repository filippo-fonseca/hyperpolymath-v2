// apps/desktop/src/flowpill/audio/capture.ts
// The flowpill capture session: microphone open, to finished transcript string.
//
// Contract with the caller (the pill controller owns the Option key, this file
// owns nothing about triggering):
//
//   armPreroll()          open the mic early and start a rolling pre-roll
//   startCapture(mode)    begin an utterance, prepending whatever pre-roll exists
//   handle.stop()         end the utterance and transcribe it, once
//   handle.cancel()       discard everything, send nothing
//   handle.onLevel(fn)    0..1 RMS for the waveform, about 50 times a second
//   handle.onSilence(fn)  "the user has been quiet for N ms", advisory only
//
// Everything the caller must react to arrives as a `CaptureOutcome` value.
// Nothing here throws at the caller and nothing retries silently more than once.
//
// The whole utterance is buffered and transcribed ONCE at the end. That is
// deliberate: giving the transcriber the full utterance is what lets it drop
// filler words and honour self-corrections. Streaming partial transcripts would
// be faster to first paint and worse at the only thing that matters here.
//
// This path is input only. It never speaks, never plays audio, and never renders
// a JARVIS response.

import { LevelMeter } from "./level";
import { PrerollBuffer } from "./preroll";
import { bufferHasSpeech, SilenceWatcher } from "./silence";
import { createTauriPcmSource, MicBusyError } from "./source";
import { transcribeUtterance, type TranscribeDeps, type TranscriptionResult } from "./transcribe";
import {
  resolveConfig,
  type CaptureMode,
  type CaptureOutcome,
  type FlowpillAudioConfig,
  type PcmChunk,
  type PcmSource,
} from "./types";

export interface CaptureOptions {
  /** Override the microphone. Tests pass a synthetic PCM source. */
  createSource?: () => PcmSource;
  /** Override transcription wholesale. Tests pass a stub. */
  transcribe?: (samples: Float32Array, sampleRate: number) => Promise<TranscriptionResult>;
  /** Passed through to the real transcriber (fetch stub, base URL, auth). */
  transcribeDeps?: TranscribeDeps;
  config?: Partial<FlowpillAudioConfig>;
}

export interface CaptureHandle {
  readonly mode: CaptureMode;
  /** Subscribe to the waveform level (0..1). Returns an unsubscribe function. */
  onLevel(fn: (level: number) => void): () => void;
  /** Subscribe to the advisory silence hint. Returns an unsubscribe function. */
  onSilence(fn: (silentMs: number) => void): () => void;
  /** End the utterance and transcribe it. Safe to call more than once. */
  stop(): Promise<CaptureOutcome>;
  /** Discard the utterance. Nothing is transcribed and nothing is sent. */
  cancel(): Promise<CaptureOutcome>;
  /** Resolves with the same outcome whoever ended the session. */
  readonly done: Promise<CaptureOutcome>;
  /** True until the session has settled. */
  isActive(): boolean;
}

// ─── Microphone runner ──────────────────────────────────────────────────────
// One microphone, one pre-roll ring, at most one session. The runner exists so
// arming and capturing share a single open device: opening the mic a second time
// at the moment the user starts speaking is exactly what clips the first word.

interface MicState {
  source: PcmSource;
  preroll: PrerollBuffer;
  sink: ((chunk: PcmChunk) => void) | null;
  framesReceived: number;
  sampleRate: number;
  openWatchdog: ReturnType<typeof setTimeout> | null;
  idleTimer: ReturnType<typeof setTimeout> | null;
  config: FlowpillAudioConfig;
}

let mic: MicState | null = null;
let micDenied: string | null = null;
let session: Session | null = null;

function log(message: string): void {
  // eslint-disable-next-line no-console
  console.log(`[flowpill/audio] ${message}`);
}

function clearMicTimers(state: MicState): void {
  if (state.openWatchdog) {
    clearTimeout(state.openWatchdog);
    state.openWatchdog = null;
  }
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
}

/** The mic produced no frames at all. On macOS a denied grant looks exactly
 *  like this: the device opens without error and stays silent forever. */
function onMicSilentOpen(): void {
  micDenied =
    "the microphone opened but delivered no audio; check System Settings > Privacy & Security > Microphone";
  log("no audio frames after mic open, treating the microphone as unavailable");
  const active = session;
  void closeMic();
  if (active) void active.settle({ kind: "mic-denied", message: micDenied });
}

function armIdleTimer(state: MicState): void {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  state.idleTimer = setTimeout(() => {
    if (!session) {
      log("pre-roll armed but unused, releasing the microphone");
      void closeMic();
    }
  }, state.config.prerollIdleTimeoutMs);
}

async function openMic(opts: CaptureOptions): Promise<{ ok: true } | { ok: false; message: string }> {
  if (mic) return { ok: true };
  const config = resolveConfig(opts.config);
  const source = (opts.createSource ?? createTauriPcmSource)();
  const state: MicState = {
    source,
    preroll: new PrerollBuffer(Math.round((config.prerollMs / 1000) * config.sampleRate)),
    sink: null,
    framesReceived: 0,
    sampleRate: config.sampleRate,
    openWatchdog: null,
    idleTimer: null,
    config,
  };

  try {
    await source.start((chunk) => {
      const current = mic;
      if (!current) return;
      current.framesReceived += 1;
      current.sampleRate = chunk.sampleRate || current.sampleRate;
      if (current.openWatchdog) {
        clearTimeout(current.openWatchdog);
        current.openWatchdog = null;
      }
      micDenied = null;
      if (current.sink) current.sink(chunk);
      else current.preroll.push(chunk.samples);
    });
  } catch (err) {
    const message =
      err instanceof MicBusyError
        ? err.message
        : err instanceof Error
          ? err.message
          : "the microphone could not be opened";
    log(`mic open failed: ${message}`);
    return { ok: false, message };
  }

  mic = state;
  micDenied = null;
  state.openWatchdog = setTimeout(onMicSilentOpen, config.micOpenTimeoutMs);
  armIdleTimer(state);
  return { ok: true };
}

async function closeMic(): Promise<void> {
  const state = mic;
  if (!state) return;
  mic = null;
  clearMicTimers(state);
  state.sink = null;
  state.preroll.clear();
  try {
    await state.source.stop();
  } catch (err) {
    log(`mic stop failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Open the microphone early and start filling the pre-roll ring. Call this the
 * instant the Option key goes down, before the hold-versus-double-tap gesture
 * has even been decided; the few hundred milliseconds it buys are the user's
 * first syllable. Cheap to call repeatedly.
 */
export async function armPreroll(
  opts: CaptureOptions = {},
): Promise<{ ok: true } | { ok: false; message: string }> {
  const result = await openMic(opts);
  if (result.ok && mic) armIdleTimer(mic);
  return result;
}

/** Release the microphone and drop the pre-roll. No-op during a session. */
export async function disarmPreroll(): Promise<void> {
  if (session) return;
  await closeMic();
}

// ─── Session ────────────────────────────────────────────────────────────────

class Session implements CaptureHandle {
  readonly mode: CaptureMode;
  readonly done: Promise<CaptureOutcome>;

  private readonly config: FlowpillAudioConfig;
  private readonly opts: CaptureOptions;
  private readonly meter: LevelMeter;
  private readonly watcher: SilenceWatcher;
  private readonly levelListeners = new Set<(level: number) => void>();
  private readonly silenceListeners = new Set<(silentMs: number) => void>();
  private readonly chunks: Float32Array[] = [];

  private totalSamples = 0;
  private sampleRate: number;
  private settled = false;
  private finishing = false;
  private cancelRequested = false;
  private resolveDone!: (outcome: CaptureOutcome) => void;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = Date.now();

  constructor(mode: CaptureMode, config: FlowpillAudioConfig, opts: CaptureOptions) {
    this.mode = mode;
    this.config = config;
    this.opts = opts;
    this.sampleRate = config.sampleRate;
    this.meter = new LevelMeter(config.levelWindowSamples, config.levelGain);
    this.watcher = new SilenceWatcher({
      sampleRate: config.sampleRate,
      rmsThreshold: config.rmsThreshold,
      silenceHintMs: config.silenceHintMs,
    });
    this.done = new Promise<CaptureOutcome>((resolve) => {
      this.resolveDone = resolve;
    });
  }

  /** Prepend whatever the pre-roll ring holds, so the first syllable survives. */
  seed(preroll: Float32Array): void {
    if (preroll.length === 0) return;
    this.chunks.push(preroll);
    this.totalSamples += preroll.length;
    log(`seeded ${preroll.length} pre-roll samples`);
  }

  armCap(): void {
    this.capTimer = setTimeout(() => {
      log("utterance hit the hard ceiling, ending it");
      void this.stop();
    }, this.config.maxUtteranceMs);
  }

  onChunk(chunk: PcmChunk): void {
    if (this.settled || this.finishing) return;
    this.sampleRate = chunk.sampleRate || this.sampleRate;
    this.chunks.push(chunk.samples);
    this.totalSamples += chunk.samples.length;
    for (const level of this.meter.push(chunk.samples)) this.emitLevel(level);
    const silentMs = this.watcher.push(chunk.samples);
    if (silentMs !== null) {
      for (const fn of this.silenceListeners) fn(silentMs);
    }
  }

  onLevel(fn: (level: number) => void): () => void {
    this.levelListeners.add(fn);
    return () => {
      this.levelListeners.delete(fn);
    };
  }

  onSilence(fn: (silentMs: number) => void): () => void {
    this.silenceListeners.add(fn);
    return () => {
      this.silenceListeners.delete(fn);
    };
  }

  isActive(): boolean {
    return !this.settled;
  }

  private emitLevel(level: number): void {
    for (const fn of this.levelListeners) fn(level);
  }

  private buffer(): Float32Array {
    const out = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.chunks) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }

  private durationMs(): number {
    return Math.round((this.totalSamples / this.sampleRate) * 1000);
  }

  /** Resolve the session exactly once and let the microphone go. */
  async settle(outcome: CaptureOutcome): Promise<CaptureOutcome> {
    if (this.settled) return this.done;
    this.settled = true;
    if (this.capTimer) {
      clearTimeout(this.capTimer);
      this.capTimer = null;
    }
    if (mic) mic.sink = null;
    if (session === this) session = null;
    this.emitLevel(0);
    await closeMic();
    log(`session settled: ${outcome.kind}`);
    this.resolveDone(outcome);
    return outcome;
  }

  async cancel(): Promise<CaptureOutcome> {
    this.cancelRequested = true;
    if (this.settled) return this.done;
    if (this.finishing) return this.done; // the in-flight stop resolves as cancelled
    return this.settle({ kind: "cancelled" });
  }

  async stop(): Promise<CaptureOutcome> {
    if (this.settled || this.finishing) return this.done;
    this.finishing = true;

    // Stop metering and release the device before the network round trip, so the
    // macOS recording indicator goes out the moment the user lets go.
    if (mic) mic.sink = null;
    const trailing = this.meter.flush();
    if (trailing !== null) this.emitLevel(trailing);
    const framesReceived = mic?.framesReceived ?? 0;
    const elapsedMs = Date.now() - this.startedAt;
    await closeMic();

    if (this.cancelRequested) return this.settle({ kind: "cancelled" });

    // The mic was open long enough that frames should have arrived and none did.
    if (framesReceived === 0 && elapsedMs >= this.config.micOpenTimeoutMs) {
      return this.settle({
        kind: "mic-denied",
        message:
          "the microphone opened but delivered no audio; check System Settings > Privacy & Security > Microphone",
      });
    }

    const samples = this.buffer();
    const durationMs = this.durationMs();

    // Silence gate. A buffer with no speech energy never reaches STT: given
    // silence, Whisper-class models invent a confident sentence, and on this
    // path that sentence would be posted to JARVIS as if the user had said it.
    if (!bufferHasSpeech(samples, this.config.rmsThreshold)) {
      log("no speech energy in the buffer, not transcribing");
      return this.settle({ kind: "empty", reason: "silence", durationMs });
    }

    const transcribe =
      this.opts.transcribe ??
      ((buf: Float32Array, rate: number) =>
        transcribeUtterance(buf, rate, this.opts.transcribeDeps));

    let result: TranscriptionResult;
    try {
      result = await transcribe(samples, this.sampleRate);
    } catch (err) {
      result = {
        kind: "failed",
        message: err instanceof Error ? err.message : "transcription threw",
      };
    }

    // Escape pressed while the request was in flight: honour it, send nothing.
    if (this.cancelRequested) return this.settle({ kind: "cancelled" });

    if (result.kind === "transcript") {
      return this.settle({ kind: "transcript", text: result.text, durationMs });
    }
    if (result.kind === "empty") {
      return this.settle({ kind: "empty", reason: "blank-transcript", durationMs });
    }
    return this.settle({
      kind: "stt-failed",
      message: result.message,
      ...(result.status === undefined ? {} : { status: result.status }),
    });
  }
}

/** A handle for a session that never got off the ground. */
function deadHandle(mode: CaptureMode, outcome: CaptureOutcome): CaptureHandle {
  const done = Promise.resolve(outcome);
  const noop = () => () => {};
  return {
    mode,
    onLevel: noop,
    onSilence: noop,
    stop: () => done,
    cancel: () => done,
    done,
    isActive: () => false,
  };
}

/**
 * Begin an utterance.
 *
 * `mode` records how the caller intends to end it (`hold` on Option release,
 * `locked` on the next Option tap). Buffering is identical either way: the
 * caller decides when the utterance ends, and this module never ends one on the
 * user's behalf except at the runaway ceiling.
 *
 * Always resolves with a handle. A microphone that cannot be opened comes back
 * as a settled handle whose outcome is `mic-denied`, not as a rejection.
 */
export async function startCapture(
  mode: CaptureMode,
  opts: CaptureOptions = {},
): Promise<CaptureHandle> {
  if (session?.isActive()) {
    log("a capture session is already running, returning the existing handle");
    return session;
  }

  const config = resolveConfig(opts.config);
  const opened = await openMic(opts);
  if (!opened.ok) {
    return deadHandle(mode, { kind: "mic-denied", message: opened.message });
  }
  if (micDenied) {
    return deadHandle(mode, { kind: "mic-denied", message: micDenied });
  }

  const state = mic;
  if (!state) {
    return deadHandle(mode, {
      kind: "mic-denied",
      message: "the microphone closed before the utterance started",
    });
  }

  const next = new Session(mode, config, opts);
  session = next;
  if (state.idleTimer) {
    clearTimeout(state.idleTimer);
    state.idleTimer = null;
  }
  next.seed(state.preroll.drain());
  state.sink = (chunk) => next.onChunk(chunk);
  next.armCap();
  log(`capture started in ${mode} mode`);
  return next;
}

/** The running session, if any. */
export function activeCapture(): CaptureHandle | null {
  return session?.isActive() ? session : null;
}

/** True while the flowpill owns the microphone. */
export function isFlowpillCaptureActive(): boolean {
  return session?.isActive() === true;
}

/**
 * Tear everything down. Intended for tests and for app shutdown; a running
 * session is cancelled, not sent.
 */
export async function resetFlowpillAudio(): Promise<void> {
  const active = session;
  if (active) await active.cancel();
  await closeMic();
  micDenied = null;
}
