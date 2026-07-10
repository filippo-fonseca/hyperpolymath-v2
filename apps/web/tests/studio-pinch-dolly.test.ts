import { describe, expect, it } from "vitest";

import { createPinchDolly, DEFAULT_PINCH_DOLLY } from "@/lib/studio/input/pinch-dolly";

// The default config the camera path uses; the tests reason directly against it.
const C = DEFAULT_PINCH_DOLLY;
const FPS = 1000 / 30;

/** Palm size that is `octaves` above a baseline (size · 2^octaves). */
const grow = (base: number, octaves: number): number => base * Math.pow(2, octaves);

describe("createPinchDolly", () => {
  it("baselines on the first engaged frame and reports z = 0", () => {
    const pd = createPinchDolly();
    expect(pd.push(0, 0.3, true, false)).toBe(0);
  });

  it("reports 0 while never engaged", () => {
    const pd = createPinchDolly();
    expect(pd.push(0, 0.3, false, false)).toBe(0);
    expect(pd.push(FPS, 0.5, false, false)).toBe(0);
  });

  it("a growing palm (hand approaching) dollies in, proportional to the approach", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.2, true, false); // baseline size0 = 0.2
    const zNear = pd.push(FPS, grow(0.2, 0.3), true, false); // +0.3 octaves
    const zMid = pd.push(2 * FPS, grow(0.2, 0.15), true, false); // +0.15 octaves
    expect(zNear).toBeGreaterThan(0);
    expect(zMid).toBeGreaterThan(0);
    expect(zNear).toBeGreaterThan(zMid); // nearer ⇒ larger z
    // Shaping: sign(c)·(|c| − exitDeadzone)·gain, clamped ±1.
    expect(zNear).toBeCloseTo((0.3 - C.exitDeadzone) * C.gain, 6);
    expect(zMid).toBeCloseTo((0.15 - C.exitDeadzone) * C.gain, 6);
  });

  it("a shrinking palm (hand receding) dollies out", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false); // baseline
    const z = pd.push(FPS, grow(0.3, -0.2), true, false); // −0.2 octaves
    expect(z).toBeLessThan(0);
    expect(z).toBeCloseTo(-(0.2 - C.exitDeadzone) * C.gain, 6);
  });

  it("micro-jitter inside the deadzone holds z at 0", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false);
    expect(pd.push(FPS, grow(0.3, 0.02), true, false)).toBe(0); // |c| = 0.02 < deadzone
    expect(pd.push(2 * FPS, grow(0.3, -0.02), true, false)).toBe(0); // |c| = 0.02 < deadzone
  });

  it("hysteresis: once armed a dip into the band stays live; below exit disarms", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false);
    const zArm = pd.push(FPS, grow(0.3, 0.05), true, false); // c = 0.05 > deadzone ⇒ arm
    expect(zArm).toBeGreaterThan(0);
    // c = 0.03 is BELOW the deadzone but ABOVE exitDeadzone: a plain deadzone
    // would drop to 0 here; the latch keeps it live (same sign, smaller z).
    const zBand = pd.push(2 * FPS, grow(0.3, 0.03), true, false);
    expect(zBand).toBeGreaterThan(0);
    expect(zBand).toBeLessThan(zArm);
    // c = 0.015 < exitDeadzone ⇒ disarm ⇒ z eases to 0.
    expect(pd.push(3 * FPS, grow(0.3, 0.015), true, false)).toBe(0);
  });

  it("disarm snaps z fully to 0 even from a sub-quantum residual (no trapped dolly)", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false); // baseline size0 = 0.3
    pd.push(FPS, grow(0.3, 0.1), true, false); // arm high (z ≈ 0.16)
    // Drop straight to a still-armed z whose distance from 0 is BELOW emitQuantum:
    // target = (0.025 − exitDeadzone)·gain = (0.025 − 0.02)·2 = 0.01 < emitQuantum.
    const zSmall = pd.push(2 * FPS, grow(0.3, 0.025), true, false);
    expect(zSmall).toBeCloseTo(0.01, 6);
    // Now fall below exitDeadzone ⇒ disarm. A quantum-gated update would leave z at
    // 0.01 (|0 − 0.01| < emitQuantum) and trap a residual dolly for the rest of the
    // pinch; the latch dropping must instead return the dolly fully to neutral.
    expect(pd.push(3 * FPS, grow(0.3, 0.01), true, false)).toBe(0);
  });

  it("a still pinched hand holds a steady z (emission quantum)", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false);
    const z1 = pd.push(FPS, grow(0.3, 0.3), true, false);
    const z2 = pd.push(2 * FPS, grow(0.3, 0.3), true, false); // identical size
    const z3 = pd.push(3 * FPS, grow(0.3, 0.3) * 1.001, true, false); // sub-quantum wobble
    expect(z2).toBe(z1);
    expect(z3).toBe(z1);
  });

  it("no-lurch engage: engaging at any hand depth reads z = 0 and holds", () => {
    const pd = createPinchDolly();
    // Engage with a large palm (hand already near) — the baseline IS that size,
    // so there is no zoom-in lurch; holding steady stays 0.
    expect(pd.push(0, 0.8, true, false)).toBe(0);
    expect(pd.push(FPS, 0.8, true, false)).toBe(0);
  });

  it("freezes z during the release grace (no dolly lurch as the hand opens)", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false); // baseline
    const zHeld = pd.push(FPS, grow(0.3, 0.3), true, false); // dolly in, z > 0
    expect(zHeld).toBeGreaterThan(0);
    // Fingers open: palm size wobbles hard, but releasing ⇒ freeze the last z.
    const zFrozen = pd.push(2 * FPS, grow(0.3, -0.5), true, true);
    expect(zFrozen).toBe(zHeld);
  });

  it("release re-baselines: a fresh engage measures depth from the new palm size", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false);
    pd.push(FPS, grow(0.3, 0.3), true, false);
    expect(pd.push(2 * FPS, 0.3, false, false)).toBe(0); // release ⇒ reset
    expect(pd.push(3 * FPS, 0.5, true, false)).toBe(0); // new baseline size0 = 0.5
    expect(pd.push(4 * FPS, grow(0.5, 0.3), true, false)).toBeCloseTo(
      (0.3 - C.exitDeadzone) * C.gain,
      6,
    );
  });

  it("ln symmetry: doubling the palm saturates +1, halving mirrors to −1", () => {
    const up = createPinchDolly();
    up.push(0, 0.25, true, false); // baseline
    expect(up.push(FPS, 0.5, true, false)).toBe(1); // 2x ⇒ +1 octave ⇒ (1−exit)·gain clamps +1

    const down = createPinchDolly();
    down.push(0, 0.5, true, false); // baseline
    expect(down.push(FPS, 0.25, true, false)).toBe(-1); // 0.5x ⇒ −1 octave ⇒ clamps −1
  });

  it("ln symmetry below saturation: halving-direction mirrors doubling-direction", () => {
    const up = createPinchDolly();
    up.push(0, 0.3, true, false);
    const zUp = up.push(FPS, grow(0.3, 0.25), true, false); // +0.25 oct

    const down = createPinchDolly();
    down.push(0, 0.3, true, false);
    const zDown = down.push(FPS, grow(0.3, -0.25), true, false); // −0.25 oct

    expect(zUp).toBeCloseTo((0.25 - C.exitDeadzone) * C.gain, 6);
    expect(zDown).toBeCloseTo(-zUp, 6);
  });

  it("a degenerate palm size never baselines and holds the last z", () => {
    const pd = createPinchDolly();
    expect(pd.push(0, 0, true, false)).toBe(0); // size 0 ⇒ does not baseline
    pd.push(FPS, 0.3, true, false); // now baselines
    const z = pd.push(2 * FPS, grow(0.3, 0.3), true, false);
    expect(z).toBeGreaterThan(0);
    expect(pd.push(3 * FPS, 0, true, false)).toBe(z); // held, not recomputed
    expect(pd.push(4 * FPS, Infinity, true, false)).toBe(z); // non-finite also held
  });

  it("reset() clears the baseline and scalar", () => {
    const pd = createPinchDolly();
    pd.push(0, 0.3, true, false);
    pd.push(FPS, grow(0.3, 0.3), true, false);
    pd.reset();
    // After reset the next engaged frame re-baselines (reports 0), not a stale z.
    expect(pd.push(2 * FPS, grow(0.3, 0.3), true, false)).toBe(0);
  });
});
