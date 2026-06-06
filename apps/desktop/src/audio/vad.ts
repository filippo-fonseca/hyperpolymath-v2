// apps/desktop/src/audio/vad.ts
// RMS-based VAD silence detector ported from PhysicalExtensionRecorder.tsx
// (commit 27125ac values). Pure function — no DOM, no AudioContext.
//
// Algorithm mirrors the browser's on-demand mic logic:
//   - Grace period (1.5s): silence detection not armed yet, user starts speaking.
//   - RMS poll: RMS < threshold for 1s continuous → end-of-speech.
//   - Hard cap (8s): unconditional stop regardless of speech/silence.
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
  gracePeriodMs: 1_500,
  silenceEndMs: 1_500,
  hardCapMs: 8_000,
  rmsThreshold: 0.01,
};

export class VadSilenceDetector {
  private readonly params: VadParams;
  private buffer: Float32Array[];
  private totalSamples: number;
  private silentSamples: number;
  private startMs: number;

  constructor(params: VadParams = VAD_DEFAULTS) {
    this.params = params;
    this.buffer = [];
    this.totalSamples = 0;
    this.silentSamples = 0;
    this.startMs = 0;
  }

  /** Reset state and mark the start of a new turn. Call before pushing chunks. */
  start(): void {
    this.buffer = [];
    this.totalSamples = 0;
    this.silentSamples = 0;
    this.startMs = Date.now();
  }

  /**
   * Push a chunk of 16 kHz mono PCM samples from the cpal IPC event.
   * Returns `true` when end-of-speech is detected (silence or hard cap).
   * The caller should then invoke `flush()` to get the accumulated buffer.
   */
  push(chunk: Float32Array): boolean {
    this.buffer.push(chunk);
    this.totalSamples += chunk.length;

    const elapsedMs = Date.now() - this.startMs;

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

function computeRms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sumSquares = 0;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i] ?? 0;
    sumSquares += s * s;
  }
  return Math.sqrt(sumSquares / samples.length);
}
