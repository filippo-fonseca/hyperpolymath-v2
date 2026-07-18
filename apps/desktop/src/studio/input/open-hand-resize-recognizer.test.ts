import { describe, expect, it } from "vitest";

import {
  createOpenHandResizeRecognizer,
  DEFAULT_OPEN_HAND_RESIZE,
  type OpenHandResizeSample,
} from "./open-hand-resize-recognizer";
import type { StudioPhaseInput } from "./types";

/**
 * Drive the recognizer with a stream of samples, collecting every emitted phase.
 * The arm dwell is `armMs`; the first engaged sample only starts the dwell clock.
 */
function run(
  samples: OpenHandResizeSample[],
  config?: Parameters<typeof createOpenHandResizeRecognizer>[1],
): StudioPhaseInput[] {
  const events: StudioPhaseInput[] = [];
  const rec = createOpenHandResizeRecognizer((e) => events.push(e), config);
  for (const s of samples) rec.push(s);
  return events;
}

const { armMs } = DEFAULT_OPEN_HAND_RESIZE;

describe("open-hand resize recognizer", () => {
  it("does not arm until the candidate dwell elapses", () => {
    // Two engaged frames just under armMs apart: clock starts, never arms.
    const events = run([
      { t: 0, openness: 1.8, engaged: true },
      { t: armMs - 10, openness: 1.8, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("arms after the dwell, emitting resizeStart + a baseline resizeMove(1)", () => {
    const events = run([
      { t: 0, openness: 1.8, engaged: true },
      { t: armMs + 1, openness: 1.8, engaged: true },
    ]);
    expect(events).toEqual([
      { type: "resizeStart" },
      { type: "resizeMove", scale: 1 },
    ]);
  });

  it("a momentary open flash (releasing a grab) never arms", () => {
    // Engaged for a single frame, then gone: the dwell resets, nothing emits.
    const events = run([
      { t: 0, openness: 1.9, engaged: true },
      { t: 20, openness: 1.9, engaged: false },
      { t: 40, openness: 1.9, engaged: true },
    ]);
    expect(events).toEqual([]);
  });

  it("holds scale ~1 inside the deadband (steady hand never drifts)", () => {
    const events = run([
      { t: 0, openness: 1.8, engaged: true },
      { t: armMs + 1, openness: 1.8, engaged: true }, // arm, baseline 1.8
      // Move within the deadband (0.12): target stays 1, no further emit.
      { t: armMs + 40, openness: 1.9, engaged: true },
    ]);
    expect(events).toEqual([
      { type: "resizeStart" },
      { type: "resizeMove", scale: 1 },
    ]);
  });

  it("grows the scale past the deadband and rate-limits toward the target", () => {
    // Open well past the deadband; the rate limiter (maxScaleStepPerMs) caps how
    // fast the emitted scale climbs, so early frames emit intermediate values
    // strictly above 1, monotonically increasing.
    const events = run([
      { t: 0, openness: 1.6, engaged: true },
      { t: armMs + 1, openness: 1.6, engaged: true }, // arm, baseline 1.6
      { t: armMs + 100, openness: 2.4, engaged: true },
      { t: armMs + 200, openness: 2.4, engaged: true },
      { t: armMs + 300, openness: 2.4, engaged: true },
    ]);
    const moves = events.filter(
      (e): e is { type: "resizeMove"; scale: number } => e.type === "resizeMove",
    );
    expect(events[0]).toEqual({ type: "resizeStart" });
    // First move is the arm baseline; subsequent moves grow monotonically > 1.
    expect(moves[0]!.scale).toBe(1);
    for (let i = 2; i < moves.length; i++) {
      expect(moves[i]!.scale).toBeGreaterThan(moves[i - 1]!.scale);
    }
    expect(moves.at(-1)!.scale).toBeGreaterThan(1);
    // Rate limit respected: no single step exceeds maxScaleStepPerMs * dt (100ms).
    expect(moves[1]!.scale - moves[0]!.scale).toBeLessThanOrEqual(
      DEFAULT_OPEN_HAND_RESIZE.maxScaleStepPerMs * 100 + 1e-9,
    );
  });

  it("clamps a huge opening to maxScale over time", () => {
    const samples: OpenHandResizeSample[] = [
      { t: 0, openness: 1.5, engaged: true },
      { t: armMs + 1, openness: 1.5, engaged: true },
    ];
    // Long hold fully open so the rate-limited scale converges to its clamp.
    for (let i = 1; i <= 4000; i++) {
      samples.push({ t: armMs + 1 + i * 16, openness: 3.5, engaged: true });
    }
    const events = run(samples);
    const last = events.filter((e) => e.type === "resizeMove").at(-1) as {
      scale: number;
    };
    expect(last.scale).toBeLessThanOrEqual(DEFAULT_OPEN_HAND_RESIZE.maxScale + 1e-6);
    expect(last.scale).toBeGreaterThan(DEFAULT_OPEN_HAND_RESIZE.maxScale - 0.05);
  });

  it("disarms with a resizeEnd when engagement drops after arming", () => {
    const events = run([
      { t: 0, openness: 1.8, engaged: true },
      { t: armMs + 1, openness: 1.8, engaged: true }, // arm
      { t: armMs + 50, openness: 1.8, engaged: false }, // pinch / hover lost
    ]);
    expect(events.at(-1)).toEqual({ type: "resizeEnd" });
  });

  it("reset() mid-resize emits a terminal resizeEnd (hand-loss safety)", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createOpenHandResizeRecognizer((e) => events.push(e));
    rec.push({ t: 0, openness: 1.8, engaged: true });
    rec.push({ t: armMs + 1, openness: 1.8, engaged: true }); // armed
    rec.reset();
    expect(events.at(-1)).toEqual({ type: "resizeEnd" });
  });

  it("reset() before arming emits nothing (no orphaned resizeEnd)", () => {
    const events: StudioPhaseInput[] = [];
    const rec = createOpenHandResizeRecognizer((e) => events.push(e));
    rec.push({ t: 0, openness: 1.8, engaged: true }); // candidate, not armed
    rec.reset();
    expect(events).toEqual([]);
  });
});
