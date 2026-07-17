/**
 * Fist-drag scroll recognizer — the PRIMARY scroll gesture, an explicit sticky
 * mode, a pure state machine mirroring `four-finger-scroll-recognizer.ts`.
 *
 * Pose: a CLOSED FIST dragged vertically. Making a fist and moving the whole
 * hand up/down scrolls the surface under the reticle — the most reliable scroll
 * primitive because a fist is an unambiguous, high-confidence pose (unlike the
 * four-finger-curl band, which fought palm-click's close). The cursor is already
 * frozen while a fist is held (gesture-core), so translation drives ONLY the
 * scroll.
 *
 * A committed fist can mean four different things, so this recognizer ARBITRATES
 * by the shape of the palm-centroid translation from the fist's engage origin,
 * and exposes its decision via `mode` so gesture-core can gate the siblings:
 *   - VERTICAL-dominant translation past the activation threshold → SCROLL
 *     (this recognizer owns it): a sticky mode that emits `scrollStart`, then a
 *     per-frame incremental `scrollMove{dy}` from the vertical delta, and
 *     `scrollEnd` on release.
 *   - LATERAL-dominant translation past the threshold → SWIPE (the shared swipe
 *     recognizer owns it): this recognizer latches `swipe` mode and never
 *     scrolls for the rest of the fist.
 *   - No translation, quick reopen → palm-click (the click owns it).
 *   - No translation, held → collapse.
 * The first axis to cross the activation threshold WINS and latches for the
 * whole fist (hysteresis by latching, not per-frame re-classification), so a
 * scroll never flickers into a swipe mid-drag or vice-versa.
 *
 * `dy` sign: MediaPipe/stage y grows DOWNWARD. Dragging the fist DOWN (ny
 * increasing) scrolls the content DOWN (positive dy), matching a natural "pull
 * the page down" feel. Framework/DOM-free; unit-tested with synthetic streams.
 */

import { clamp } from "./clamp";
import type { StudioPhaseInput } from "./types";

export type FistScrollSample = {
  t: number;
  /** Palm-centroid x in cursor space (0..1). */
  nx: number;
  /** Palm-centroid y in cursor space (0..1). */
  ny: number;
  /** True while a fist is committed (gesture-core's debounced fist pose). */
  engaged: boolean;
};

/** Which interaction a committed fist has latched onto. */
export type FistScrollMode = "idle" | "scroll" | "swipe";

export type FistScrollConfig = {
  /**
   * Net translation (normalized) from the fist origin before an axis claims the
   * fist. Below this the fist is still "stationary" (palm-click / collapse own
   * it). A modest value so a deliberate drag activates quickly without a resting
   * fist drifting into a scroll.
   */
  activateDist: number;
  /**
   * Vertical dominance ratio: the fist scrolls only when |dy| exceeds |dx| by
   * this factor at activation, so a mostly-sideways drag goes to swipe instead.
   */
  verticalDominance: number;
  /** Multiplier turning a vertical-translation delta into wheel px. */
  pixelsPerUnit: number;
  /** Clamp on a single frame's emitted |dy| so a landmark pop can't lurch. */
  maxStepPx: number;
};

export const DEFAULT_FIST_SCROLL: FistScrollConfig = {
  activateDist: 0.05,
  verticalDominance: 1.2,
  pixelsPerUnit: 1600,
  maxStepPx: 90,
};

export type FistScrollRecognizer = {
  push(sample: FistScrollSample): void;
  reset(): void;
  /** Current latched interaction for the active fist ("idle" until an axis wins). */
  readonly mode: FistScrollMode;
};

/**
 * Creates a fist-drag scroll recognizer. `onEvent` receives a targetless
 * `scrollStart`, incremental `scrollMove{dy}`, and a terminal `scrollEnd`.
 * `reset()` mid-scroll emits `scrollEnd` first so a hand-lost gap never strands
 * the lifecycle.
 */
export function createFistScrollRecognizer(
  onEvent: (event: StudioPhaseInput) => void,
  config?: Partial<FistScrollConfig>,
): FistScrollRecognizer {
  const cfg: FistScrollConfig = { ...DEFAULT_FIST_SCROLL, ...config };

  let origin: { nx: number; ny: number } | null = null;
  let mode: FistScrollMode = "idle";
  let lastNy = 0; // last vertical sample while scrolling (for incremental dy)

  function reset(): void {
    if (mode === "scroll") onEvent({ type: "scrollEnd" });
    origin = null;
    mode = "idle";
    lastNy = 0;
  }

  function push(sample: FistScrollSample): void {
    if (!sample.engaged) {
      reset();
      return;
    }

    if (origin === null) {
      // Rising edge: anchor the fist origin. No decision yet.
      origin = { nx: sample.nx, ny: sample.ny };
      mode = "idle";
      return;
    }

    if (mode === "scroll") {
      // Sticky scroll: incremental vertical delta → wheel px.
      const dNy = sample.ny - lastNy;
      lastNy = sample.ny;
      const dy = clamp(dNy * cfg.pixelsPerUnit, -cfg.maxStepPx, cfg.maxStepPx);
      if (dy !== 0) onEvent({ type: "scrollMove", dy });
      return;
    }

    if (mode === "swipe") return; // swipe owns this fist; never scroll

    // mode === "idle": watch for an axis to cross the activation threshold.
    const dx = sample.nx - origin.nx;
    const dy = sample.ny - origin.ny;
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    if (Math.hypot(dx, dy) < cfg.activateDist) return; // still stationary

    if (absDy >= absDx * cfg.verticalDominance) {
      // Vertical-dominant → claim scroll. Anchor the incremental baseline at the
      // CURRENT sample so the activation travel isn't dumped as one big first
      // delta; scrolling starts clean from here.
      mode = "scroll";
      lastNy = sample.ny;
      onEvent({ type: "scrollStart" });
    } else {
      // Lateral-dominant → the swipe recognizer owns this fist. Latch so we
      // never scroll for its duration.
      mode = "swipe";
    }
  }

  return {
    push,
    reset,
    get mode() {
      return mode;
    },
  };
}
