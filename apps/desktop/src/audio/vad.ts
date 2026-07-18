// apps/desktop/src/audio/vad.ts
// RMS-based VAD silence detector ported from PhysicalExtensionRecorder.tsx
// (commit 27125ac values). Pure function — no DOM, no AudioContext.
//
// Algorithm mirrors the browser's on-demand mic logic:
//   - Grace period (700ms): silence detection not armed yet, user starts speaking.
//   - RMS poll: RMS < threshold for silenceEndMs (800ms) continuous → end-of-speech.
//   - Hard cap (15s): unconditional stop regardless of speech/silence.
//   - RMS threshold: 0.01 (matches PhysicalExtensionRecorder commit 27125ac default).

export interface VadParams {
  sampleRate: number;
  pollIntervalMs: number;
  gracePeriodMs: number;
  silenceEndMs: number;
  hardCapMs: number;
  rmsThreshold: number;
}

export const VAD_DEFAULTS: VadParams = {
  sampleRate: 16_000,
  pollIntervalMs: 80,
  // Leading breath grace so the first word isn't clipped (RESEARCH Q2).
  gracePeriodMs: 700,
  // Snappy end-of-speech for conversational turns (was 1_500 — felt laggy).
  silenceEndMs: 800,
  // Per-utterance hard cap raised for longer conversational answers.
  hardCapMs: 15_000,
  rmsThreshold: 0.01,
};

export class VadSilenceDetector {
  private readonly params: VadParams;
  private buffer: Float32Array[];
  private totalSamples: number;
  private silentSamples: number;
  // Whether ANY pushed chunk has crossed the RMS speech threshold since the
  // last start(). Tracked on every chunk (including during the leading grace
  // window) so a quick "hi" in the first 700ms still counts as speech. Drives
  // the silence gate: a turn where this stayed false is pure silence and must
  // never reach STT (Groq/Whisper hallucinate text — "I'm going to go to the
  // next one." — from a silent WAV, which then fires a bogus agent turn).
  private speechDetected: boolean;
  // Anchor for both the leading grace window and the hard cap. Set on the FIRST
  // pushed chunk, NOT in start(), so that the ~tens-of-ms-to-~100ms cpal input
  // device open latency does NOT eat into the grace. In standby the mic is now
  // fully released (audio-quality fix), so the first turn after standby pays the
  // cold-open cost; anchoring the clock to the first real audio chunk keeps the
  // 700ms leading-breath grace intact and stops the first word being clipped or
  // a premature silence-end firing before speech has actually arrived. `-1`
  // means "not yet received the first chunk".
  private firstChunkMs: number;

  constructor(params: VadParams = VAD_DEFAULTS) {
    this.params = params;
    this.buffer = [];
    this.totalSamples = 0;
    this.silentSamples = 0;
    this.speechDetected = false;
    this.firstChunkMs = -1;
  }

  /** Reset state and mark the start of a new turn. Call before pushing chunks. */
  start(): void {
    this.buffer = [];
    this.totalSamples = 0;
    this.silentSamples = 0;
    this.speechDetected = false;
    // Defer the clock anchor to the first pushed chunk (see firstChunkMs).
    this.firstChunkMs = -1;
  }

  /**
   * True once any pushed chunk has crossed the RMS speech threshold this turn.
   * The silence gate (capture.ts) reads this before POSTing to STT: a turn that
   * never saw speech is dropped without an STT call, and the 10s no-speech
   * watchdog uses it to auto-disengage a mic that was engaged but never spoken
   * into.
   */
  hasSpeech(): boolean {
    return this.speechDetected;
  }

  /**
   * Push a chunk of 16 kHz mono PCM samples from the cpal IPC event.
   * Returns `true` when end-of-speech is detected (silence or hard cap).
   * The caller should then invoke `flush()` to get the accumulated buffer.
   */
  push(chunk: Float32Array): boolean {
    this.buffer.push(chunk);
    this.totalSamples += chunk.length;

    // Anchor the grace/hard-cap clock to the first real audio chunk so cold mic
    // open latency (mic released in standby) can't clip the leading word.
    if (this.firstChunkMs < 0) {
      this.firstChunkMs = Date.now();
    }

    const elapsedMs = Date.now() - this.firstChunkMs;

    // Speech-energy tracking runs on EVERY chunk (grace window included) so the
    // silence gate and no-speech watchdog see speech that arrives before the
    // grace period ends. Independent of the silence-end logic below.
    if (computeRms(chunk) >= this.params.rmsThreshold) {
      this.speechDetected = true;
    }

    // Hard cap — unconditional stop.
    if (elapsedMs >= this.params.hardCapMs) {
      return true;
    }

    // Grace period — silence detection not armed yet.
    if (elapsedMs < this.params.gracePeriodMs) {
      this.silentSamples = 0;
      return false;
    }

    // RMS-based silence detection.
    const rms = computeRms(chunk);
    if (rms < this.params.rmsThreshold) {
      this.silentSamples += chunk.length;
    } else {
      this.silentSamples = 0;
    }

    const silentMs =
      (this.silentSamples / this.params.sampleRate) * 1000;
    return silentMs >= this.params.silenceEndMs;
  }

  /** Concatenate all buffered chunks into a single contiguous Float32Array. */
  flush(): Float32Array {
    const out = new Float32Array(this.totalSamples);
    let offset = 0;
    for (const chunk of this.buffer) {
      out.set(chunk, offset);
      offset += chunk.length;
    }
    return out;
  }
}

export function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / samples.length);
}
