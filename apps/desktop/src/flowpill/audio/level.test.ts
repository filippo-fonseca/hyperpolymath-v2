import { describe, expect, it } from "vitest";

import { LevelMeter, computeRms, normalizeLevel } from "./level";
import { constantPcm, silentPcm, tonePcm } from "./test-fixtures";

describe("level: RMS and normalisation", () => {
  it("reads zero for digital silence and something real for a tone", () => {
    expect(computeRms(silentPcm(1_600))).toBe(0);
    expect(computeRms(tonePcm(1_600))).toBeGreaterThan(0.1);
  });

  it("clamps the normalised level to 0..1", () => {
    expect(normalizeLevel(0, 8)).toBe(0);
    expect(normalizeLevel(0.01, 8)).toBeCloseTo(0.08, 5);
    expect(normalizeLevel(5, 8)).toBe(1);
    expect(normalizeLevel(Number.NaN, 8)).toBe(0);
  });
});

describe("LevelMeter", () => {
  it("emits one level per completed window, about 50 per second at 16 kHz", () => {
    const meter = new LevelMeter(320, 8);
    // One second of audio at 16 kHz should produce 16000 / 320 = 50 levels.
    const levels = meter.push(tonePcm(16_000));
    expect(levels).toHaveLength(50);
    for (const level of levels) {
      expect(level).toBeGreaterThan(0);
      expect(level).toBeLessThanOrEqual(1);
    }
  });

  it("carries a partial window across chunk boundaries", () => {
    const meter = new LevelMeter(320, 8);
    expect(meter.push(constantPcm(200, 0.5))).toHaveLength(0);
    const levels = meter.push(constantPcm(200, 0.5));
    expect(levels).toHaveLength(1);
    // A constant 0.5 signal has RMS 0.5, which clamps to full scale at gain 8.
    expect(levels[0]).toBe(1);
    // 80 samples are still held back, so a further 240 completes exactly one more.
    expect(meter.push(constantPcm(240, 0.5))).toHaveLength(1);
  });

  it("reads near zero for silence and high for speech-level signal", () => {
    const meter = new LevelMeter(320, 8);
    expect(meter.push(silentPcm(320))).toEqual([0]);
    const [loud] = new LevelMeter(320, 8).push(constantPcm(320, 0.2));
    expect(loud).toBe(1);
  });

  it("flushes the trailing partial window and then reports nothing", () => {
    const meter = new LevelMeter(320, 8);
    meter.push(constantPcm(100, 0.1));
    expect(meter.flush()).toBeCloseTo(0.8, 5);
    expect(meter.flush()).toBeNull();
  });
});
