import { describe, expect, it } from "vitest";

import { createPinchZoom, DEFAULT_PINCH_ZOOM } from "@/lib/studio/input/pinch-zoom";

// The default config the camera path uses; the tests reason directly against it.
const C = DEFAULT_PINCH_ZOOM;
const FPS = 1000 / 30;

describe("createPinchZoom", () => {
  it("baselines on the first engaged frame and reports z = 0", () => {
    const pz = createPinchZoom();
    expect(pz.push(0, 0.3, true)).toBe(0);
  });

  it("reports 0 while never engaged", () => {
    const pz = createPinchZoom();
    expect(pz.push(0, 0.3, false)).toBe(0);
    expect(pz.push(FPS, 0.1, false)).toBe(0);
  });

  it("a tighter gap zooms in, degree-proportional to the squeeze", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true); // baseline r0 = 0.3
    const zNear = pz.push(FPS, 0.1, true); // c = 0.2
    const zMid = pz.push(2 * FPS, 0.2, true); // c = 0.1
    expect(zNear).toBeGreaterThan(0);
    expect(zMid).toBeGreaterThan(0);
    expect(zNear).toBeGreaterThan(zMid); // tighter ⇒ larger z
    // Shaping: sign(c)·(|c| − exitDeadzone)·gain, clamped ±1.
    expect(zNear).toBeCloseTo((0.2 - C.exitDeadzone) * C.gain, 6);
    expect(zMid).toBeCloseTo((0.1 - C.exitDeadzone) * C.gain, 6);
  });

  it("a widening gap (still inside the pinch band) zooms out", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true); // baseline
    const z = pz.push(FPS, 0.45, true); // c = −0.15, 0.45 < offRatio
    expect(z).toBeLessThan(0);
    expect(z).toBeCloseTo(-(0.15 - C.exitDeadzone) * C.gain, 6);
  });

  it("micro-jitter inside the deadzone holds z at 0", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    expect(pz.push(FPS, 0.32, true)).toBe(0); // |c| = 0.02 < deadzone
    expect(pz.push(2 * FPS, 0.28, true)).toBe(0); // |c| = 0.02 < deadzone
  });

  it("hysteresis: once armed a dip into the band stays live; below exit disarms", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    const zArm = pz.push(FPS, 0.24, true); // c = 0.06 > deadzone ⇒ arm
    expect(zArm).toBeGreaterThan(0);
    // c = 0.04 is BELOW the deadzone but ABOVE exitDeadzone: a plain deadzone
    // would drop to 0 here; the latch keeps it live (same sign, smaller z).
    const zBand = pz.push(2 * FPS, 0.26, true);
    expect(zBand).toBeGreaterThan(0);
    expect(zBand).toBeLessThan(zArm);
    // c = 0.015 < exitDeadzone ⇒ disarm ⇒ z eases to 0.
    expect(pz.push(3 * FPS, 0.285, true)).toBe(0);
  });

  it("a still pinched hand holds a steady z (emission quantum)", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    const z1 = pz.push(FPS, 0.15, true);
    const z2 = pz.push(2 * FPS, 0.15, true); // identical ratio
    const z3 = pz.push(3 * FPS, 0.1505, true); // sub-quantum wobble
    expect(z2).toBe(z1);
    expect(z3).toBe(z1);
  });

  it("freezes z once the hand opens past offRatio (no zoom-out spurt on release)", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    const zHeld = pz.push(FPS, 0.1, true); // z > 0
    expect(zHeld).toBeGreaterThan(0);
    const zFrozen = pz.push(2 * FPS, 0.7, true); // ratio > offRatio ⇒ freeze
    expect(zFrozen).toBe(zHeld);
  });

  it("release re-baselines: a fresh engage measures closedness from the new gap", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    pz.push(FPS, 0.1, true);
    expect(pz.push(2 * FPS, 0.3, false)).toBe(0); // release ⇒ reset
    expect(pz.push(3 * FPS, 0.2, true)).toBe(0); // new baseline r0 = 0.2
    expect(pz.push(4 * FPS, 0.1, true)).toBeCloseTo((0.1 - C.exitDeadzone) * C.gain, 6);
  });

  it("a degenerate (Infinity) ratio never baselines and holds the last z", () => {
    const pz = createPinchZoom();
    expect(pz.push(0, Infinity, true)).toBe(0); // does not baseline
    pz.push(FPS, 0.3, true); // now baselines
    const z = pz.push(2 * FPS, 0.1, true);
    expect(z).toBeGreaterThan(0);
    expect(pz.push(3 * FPS, Infinity, true)).toBe(z); // held, not recomputed
  });

  it("clamps z to +1 on a full squeeze", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.4, true); // baseline clamped to r0Max
    expect(pz.push(FPS, 0.02, true)).toBe(1);
  });

  it("a fully-closed engage reads z = 0 — no zoom-in lurch (baseline clamp floor)", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.0, true); // r0 clamped up to r0Min = deadzone
    // Holding fully closed, closedness sits exactly at the deadzone knee ⇒ 0.
    expect(pz.push(FPS, 0.0, true)).toBe(0);
  });

  it("reset() clears the baseline and scalar", () => {
    const pz = createPinchZoom();
    pz.push(0, 0.3, true);
    pz.push(FPS, 0.1, true);
    pz.reset();
    // After reset the next engaged frame re-baselines (reports 0), not a stale z.
    expect(pz.push(2 * FPS, 0.1, true)).toBe(0);
  });
});
