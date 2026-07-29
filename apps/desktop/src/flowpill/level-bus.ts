/**
 * level-bus.ts — the seam between unit u2's audio capture and the waveform.
 *
 * u2 emits a normalised RMS level 30 to 60 times a second. That is far too hot
 * for React state, so levels never enter the reducer and never trigger a render:
 * they land here, and the canvas reads them on its own animation frame.
 *
 * The bus exists so the pill has exactly one thing to subscribe to regardless of
 * how the level arrives. A controller can push frames straight in, or hand the
 * bus a {@link LevelSource} from u2's capture handle and let it pipe.
 */

import type { LevelListener, LevelSource } from "./types";

export interface LevelBus extends LevelSource {
  /** Publish one frame. Values outside 0..1 are clamped, NaN is dropped. */
  push(level: number): void;
  /** Pipe an upstream source into the bus. Returns a detach function. */
  pipe(source: LevelSource): () => void;
  /** Drop every listener. Used when the pill unmounts. */
  clear(): void;
}

export function createLevelBus(): LevelBus {
  const listeners = new Set<LevelListener>();

  const push = (level: number): void => {
    // A NaN from a divide-by-zero RMS would poison the canvas geometry for the
    // rest of the utterance, so it is dropped rather than clamped.
    if (!Number.isFinite(level)) return;
    const clamped = level < 0 ? 0 : level > 1 ? 1 : level;
    // Copied before iterating: a listener that unsubscribes itself mid-frame
    // (the waveform does exactly this when the pill stops listening) would
    // otherwise mutate the set under the loop.
    for (const listener of [...listeners]) listener(clamped);
  };

  return {
    onLevel(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    push,
    pipe(source) {
      return source.onLevel(push);
    },
    clear() {
      listeners.clear();
    },
  };
}
