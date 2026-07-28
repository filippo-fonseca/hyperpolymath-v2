// apps/desktop/src/flowpill/audio/test-fixtures.ts
// Synthetic PCM and a controllable microphone, so every test in this directory
// runs headlessly with no device, no Tauri, and no network.

import type { PcmChunk, PcmSource } from "./types";

/** Digital silence. */
export function silentPcm(samples: number): Float32Array {
  return new Float32Array(samples);
}

/** A sine tone loud enough to read as speech against the 0.01 RMS threshold. */
export function tonePcm(
  samples: number,
  { frequency = 220, amplitude = 0.3, sampleRate = 16_000 } = {},
): Float32Array {
  const out = new Float32Array(samples);
  for (let i = 0; i < samples; i++) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

/** A constant-valued buffer. Handy as a marker you can find inside a mix. */
export function constantPcm(samples: number, value: number): Float32Array {
  return new Float32Array(samples).fill(value);
}

export interface FakeSource {
  source: PcmSource;
  /** Push a chunk as if the device had delivered it. */
  emit(samples: Float32Array, sampleRate?: number): void;
  starts(): number;
  stops(): number;
  isRunning(): boolean;
}

/** A microphone under the test's control. `failWith` simulates a denied device. */
export function makeFakeSource(options: { failWith?: Error } = {}): FakeSource {
  let sink: ((chunk: PcmChunk) => void) | null = null;
  let starts = 0;
  let stops = 0;

  const source: PcmSource = {
    async start(onChunk) {
      starts += 1;
      if (options.failWith) throw options.failWith;
      sink = onChunk;
    },
    async stop() {
      stops += 1;
      sink = null;
    },
  };

  return {
    source,
    emit(samples, sampleRate = 16_000) {
      sink?.({ samples, sampleRate });
    },
    starts: () => starts,
    stops: () => stops,
    isRunning: () => sink !== null,
  };
}
