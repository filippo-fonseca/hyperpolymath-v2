// apps/desktop/src/flowpill/audio/level.ts
// RMS level metering for the pill's waveform.
//
// The capture source hands us chunks whose length is whatever CoreAudio's buffer
// size happens to be after resampling, so emitting one level per chunk would
// give a cadence that drifts with the device. Instead we re-window the stream to
// a fixed number of samples and emit one level per completed window. At the
// default 320 samples / 16 kHz that is a steady 50 Hz, inside the 30 to 60 Hz
// band the pill wants, regardless of how the device chunks its callbacks.

import { computeRms } from "@/audio/vad";

export { computeRms };

/** Map an RMS reading to the 0..1 range the waveform draws. */
export function normalizeLevel(rms: number, gain: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  return Math.min(1, rms * gain);
}

/**
 * Re-windows an incoming PCM stream into fixed-size windows and emits one
 * normalised level per window. Carries the partial window across chunk
 * boundaries, so no samples are dropped or double counted.
 */
export class LevelMeter {
  private readonly windowSamples: number;
  private readonly gain: number;
  private sumSquares = 0;
  private filled = 0;

  constructor(windowSamples: number, gain: number) {
    this.windowSamples = Math.max(1, Math.floor(windowSamples));
    this.gain = gain;
  }

  /** Feed a chunk. Returns every level the chunk completed, in order. */
  push(chunk: Float32Array): number[] {
    const levels: number[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const s = chunk[i] ?? 0;
      this.sumSquares += s * s;
      this.filled += 1;
      if (this.filled >= this.windowSamples) {
        levels.push(normalizeLevel(Math.sqrt(this.sumSquares / this.filled), this.gain));
        this.sumSquares = 0;
        this.filled = 0;
      }
    }
    return levels;
  }

  /** Emit the trailing partial window, if any, and reset. Used at end of turn. */
  flush(): number | null {
    if (this.filled === 0) return null;
    const level = normalizeLevel(Math.sqrt(this.sumSquares / this.filled), this.gain);
    this.sumSquares = 0;
    this.filled = 0;
    return level;
  }

  reset(): void {
    this.sumSquares = 0;
    this.filled = 0;
  }
}
