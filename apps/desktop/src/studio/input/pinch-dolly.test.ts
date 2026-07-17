import { describe, expect, it } from "vitest";

import { createPinchDolly, DEFAULT_PINCH_DOLLY } from "./pinch-dolly";

const DEADZONE = DEFAULT_PINCH_DOLLY.deadzone; // 0.04 octaves
const EXIT = DEFAULT_PINCH_DOLLY.exitDeadzone; // 0.02
const GAIN = DEFAULT_PINCH_DOLLY.gain; // 2
const QUANTUM = DEFAULT_PINCH_DOLLY.emitQuantum; // 0.015

const BASE = 1; // baseline palm size captured on engage

/** A palm size `oct` octaves from the baseline (+ = grown = nearer the camera). */
const atOctaves = (oct: number): number => BASE * Math.pow(2, oct);

/** The z the shaping curve yields for an active magnitude of `oct` octaves. */
const shaped = (oct: number): number => Math.sign(oct) * (Math.abs(oct) - EXIT) * GAIN;

describe("pinch-dolly (palm-size → camera dolly)", () => {
  it("reads 0 while the pinch is not engaged", () => {
    const d = createPinchDolly();
    expect(d.push(0, BASE, false, false)).toBe(0);
    expect(d.push(16, atOctaves(0.5), false, false)).toBe(0);
  });

  it("baselines on engage, so there is no lurch at z = 0", () => {
    const d = createPinchDolly();
    // Engaging with an already-large palm still starts at neutral.
    expect(d.push(0, atOctaves(2), true, false)).toBe(0);
  });

  it("holds z = 0 for jitter inside the deadzone", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    expect(d.push(16, atOctaves(DEADZONE - 0.01), true, false)).toBe(0);
    expect(d.push(32, atOctaves(-(DEADZONE - 0.01)), true, false)).toBe(0);
  });

  it("dollies IN (positive z) as the palm grows past the deadzone", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    const z = d.push(16, atOctaves(0.1), true, false);
    expect(z).toBeCloseTo(shaped(0.1), 6); // 0.16
    expect(z).toBeGreaterThan(0);
  });

  it("dollies OUT (negative z) as the palm shrinks past the deadzone", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    const z = d.push(16, atOctaves(-0.1), true, false);
    expect(z).toBeCloseTo(shaped(-0.1), 6); // -0.16
    expect(z).toBeLessThan(0);
  });

  it("clamps z to ±1 however far the hand travels", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    expect(d.push(16, atOctaves(3), true, false)).toBe(1);
    d.reset();
    d.push(32, BASE, true, false);
    expect(d.push(48, atOctaves(-3), true, false)).toBe(-1);
  });

  it("stays armed through the hysteresis band once the deadzone is cleared", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    d.push(16, atOctaves(0.1), true, false); // arms
    // Back inside the deadzone but still above exitDeadzone: still armed, and z
    // eases toward zero rather than snapping.
    const z = d.push(32, atOctaves(0.03), true, false);
    expect(z).toBeCloseTo(shaped(0.03), 6); // 0.02
    expect(z).toBeGreaterThan(0);
  });

  it("returns FULLY to neutral once the magnitude falls below exitDeadzone", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    d.push(16, atOctaves(0.1), true, false); // arms
    // Below exitDeadzone: disarm and snap to exactly 0 — a sub-quantum residual
    // must not trap a permanent dolly offset for the rest of the pinch.
    expect(d.push(32, atOctaves(EXIT - 0.01), true, false)).toBe(0);
  });

  it("never sign-flips inside the hysteresis band", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    d.push(16, atOctaves(0.1), true, false);
    // At exactly the exit floor the shaped magnitude is 0, not negative.
    expect(d.push(32, atOctaves(EXIT), true, false)).toBe(0);
  });

  it("holds the previous z for a sub-quantum change (a still hand yields a constant z)", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    const z0 = d.push(16, atOctaves(0.1), true, false); // 0.16
    // Target 0.17 — only 0.01 away, under the 0.015 quantum, so z holds.
    const z1 = d.push(32, atOctaves(0.105), true, false);
    expect(z1).toBe(z0);
    // A change past the quantum does move it.
    const z2 = d.push(48, atOctaves(0.12), true, false);
    expect(z2).toBeCloseTo(shaped(0.12), 6); // 0.20
    expect(Math.abs(z2 - z0)).toBeGreaterThanOrEqual(QUANTUM);
  });

  it("freezes z while releasing, so opening the hand never lurches the camera", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    const held = d.push(16, atOctaves(0.1), true, false);
    // The pinch is releasing: palm size wobbles wildly as the fingers open, but z
    // must not move.
    expect(d.push(32, atOctaves(0.9), true, true)).toBe(held);
    expect(d.push(48, atOctaves(-0.9), true, true)).toBe(held);
  });

  it("holds the last z through a degenerate palm size", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    const z = d.push(16, atOctaves(0.1), true, false);
    expect(d.push(32, 0, true, false)).toBe(z); // coincident landmarks
    expect(d.push(48, -1, true, false)).toBe(z);
    expect(d.push(64, Number.NaN, true, false)).toBe(z);
    expect(d.push(80, Number.POSITIVE_INFINITY, true, false)).toBe(z);
  });

  it("does not baseline off a degenerate first frame", () => {
    const d = createPinchDolly();
    expect(d.push(0, 0, true, false)).toBe(0); // rejected, no baseline captured
    d.push(16, BASE, true, false); // THIS is the baseline
    expect(d.push(32, atOctaves(0.1), true, false)).toBeCloseTo(shaped(0.1), 6);
  });

  it("re-baselines on the next engage after a release", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    d.push(16, atOctaves(0.5), true, false);
    d.push(32, atOctaves(0.5), false, false); // release: resets
    // Re-engaging at the grown size makes THAT the new zero point.
    expect(d.push(48, atOctaves(0.5), true, false)).toBe(0);
    expect(d.push(64, atOctaves(0.6), true, false)).toBeCloseTo(shaped(0.1), 6);
  });

  it("reset() clears the baseline and the scalar", () => {
    const d = createPinchDolly();
    d.push(0, BASE, true, false);
    d.push(16, atOctaves(0.1), true, false);
    d.reset();
    expect(d.push(32, atOctaves(0.1), true, false)).toBe(0); // re-baselined here
  });

  it("is deterministic: the same size stream yields the same z sequence", () => {
    const run = (): number[] => {
      const d = createPinchDolly();
      const octaves = [0, 0.03, 0.1, 0.25, 0.05, -0.2, 0];
      return octaves.map((o, i) => d.push(i * 16, atOctaves(o), true, false));
    };
    expect(run()).toEqual(run());
  });
});
