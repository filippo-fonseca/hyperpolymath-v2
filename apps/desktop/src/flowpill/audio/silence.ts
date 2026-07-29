// apps/desktop/src/flowpill/audio/silence.ts
// Continuous-silence tracking, measured in samples so it never depends on wall
// clock jitter or on how the device chunks its callbacks.
//
// This watcher REPORTS. It does not act. The flowpill never ends a user's
// utterance on its own: the Option key does that. The hint exists so the
// controller may offer an auto-stop if it decides to, and so the pill can show
// "still listening" state honestly.

import { computeRms } from "@/audio/vad";

export interface SilenceWatcherParams {
  sampleRate: number;
  rmsThreshold: number;
  silenceHintMs: number;
}

export class SilenceWatcher {
  private readonly params: SilenceWatcherParams;
  private silentSamples = 0;
  private speechDetected = false;
  /** Latched so one run of silence raises the hint once, not once per chunk. */
  private hintRaised = false;

  constructor(params: SilenceWatcherParams) {
    this.params = params;
  }

  /**
   * Feed a chunk. Returns the continuous silence in milliseconds when this chunk
   * is the one that crosses the hint threshold, and null otherwise. Speech
   * re-arms the hint, so a pause, a word, then another pause reports twice.
   */
  push(chunk: Float32Array): number | null {
    if (chunk.length === 0) return null;
    const rms = computeRms(chunk);
    if (rms >= this.params.rmsThreshold) {
      this.speechDetected = true;
      this.silentSamples = 0;
      this.hintRaised = false;
      return null;
    }
    this.silentSamples += chunk.length;
    const silentMs = (this.silentSamples / this.params.sampleRate) * 1000;
    if (!this.hintRaised && silentMs >= this.params.silenceHintMs) {
      this.hintRaised = true;
      return silentMs;
    }
    return null;
  }

  /** True once any chunk this session crossed the speech threshold. */
  hasSpeech(): boolean {
    return this.speechDetected;
  }

  /** Continuous trailing silence in milliseconds. */
  silentMs(): number {
    return (this.silentSamples / this.params.sampleRate) * 1000;
  }

  reset(): void {
    this.silentSamples = 0;
    this.speechDetected = false;
    this.hintRaised = false;
  }
}

/**
 * Whole-buffer speech gate. A buffer that never crosses the threshold must not
 * reach STT: Whisper-class models hallucinate confident text out of silence, and
 * on this path that text would be posted to JARVIS as if the user had said it.
 */
export function bufferHasSpeech(
  samples: Float32Array,
  rmsThreshold: number,
  windowSamples = 1_600,
): boolean {
  if (samples.length === 0) return false;
  const step = Math.max(1, Math.floor(windowSamples));
  for (let i = 0; i < samples.length; i += step) {
    const window = samples.subarray(i, Math.min(i + step, samples.length));
    if (computeRms(window) >= rmsThreshold) return true;
  }
  return false;
}
