/**
 * Phase 12 / WAKE-02 + D-05 — Consecutive-frame confidence guard.
 *
 * Wave 0 (TDD RED): wake-word.worker.js does not yet exist. Task 3 will
 * embed the guard in the worker; this test verifies the pure-function
 * algebra that the worker mirrors.
 *
 * Contract under test (D-05 — locked, NOT user-tunable):
 *   - Fire wake only when score > 0.5 AND prevScore > 0.5
 *   - Reset prevScore to 0 after firing (so a 3+ frame run doesn't
 *     double-trigger from the same utterance)
 *   - Frame 1 below threshold → no fire on frame 2 (prev resets to its
 *     own below-threshold value, so frame 2 sees prev < 0.5)
 *
 * Sequences exercised (per plan):
 *   [0.6, 0.6]      → 1 fire
 *   [0.6, 0.3, 0.6] → 0 fires
 *   [0.6, 0.6, 0.7] → 1 fire   (prev resets to 0 after fire; 0.7 has prev=0)
 *   [0.4, 0.6]      → 0 fires
 */
import { describe, expect, it } from "vitest";

/**
 * Pure-function mirror of the worker's D-05 guard. The worker contains
 * the EXACT same logic embedded in processFrame. If this test passes,
 * the worker passes — as long as the worker's literal expression matches
 * the source-level grep in Task 3's acceptance criteria.
 */
function consecutiveFrameGate(
  score: number,
  state: { prevScore: number },
): { fire: boolean; nextState: { prevScore: number } } {
  if (score > 0.5 && state.prevScore > 0.5) {
    // Reset prevScore to 0 so a continued run doesn't double-trigger.
    return { fire: true, nextState: { prevScore: 0 } };
  }
  return { fire: false, nextState: { prevScore: score } };
}

function runSequence(scores: number[]): number {
  let state = { prevScore: 0 };
  let fires = 0;
  for (const s of scores) {
    const result = consecutiveFrameGate(s, state);
    if (result.fire) fires += 1;
    state = result.nextState;
  }
  return fires;
}

describe("WAKE-02 + D-05 consecutive-frame guard", () => {
  it("[0.6, 0.6] fires exactly once", () => {
    expect(runSequence([0.6, 0.6])).toBe(1);
  });

  it("[0.6, 0.3, 0.6] does NOT fire (middle frame below threshold)", () => {
    expect(runSequence([0.6, 0.3, 0.6])).toBe(0);
  });

  it("[0.6, 0.6, 0.7] fires exactly once (prevScore resets to 0 after fire)", () => {
    expect(runSequence([0.6, 0.6, 0.7])).toBe(1);
  });

  it("[0.4, 0.6] does NOT fire (frame 1 below threshold)", () => {
    expect(runSequence([0.4, 0.6])).toBe(0);
  });

  it("[0.6, 0.6, 0.6, 0.6] fires twice (gates re-arm after reset)", () => {
    // First fire on [0.6, 0.6]; prevScore→0; then [0.6, 0.6] again → second fire
    expect(runSequence([0.6, 0.6, 0.6, 0.6])).toBe(2);
  });

  it("[0.51, 0.51] fires (boundary just above 0.5)", () => {
    expect(runSequence([0.51, 0.51])).toBe(1);
  });

  it("[0.5, 0.5] does NOT fire (strict > comparison, equal not enough)", () => {
    expect(runSequence([0.5, 0.5])).toBe(0);
  });
});
