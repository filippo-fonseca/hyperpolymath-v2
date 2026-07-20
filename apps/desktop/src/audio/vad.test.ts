import { describe, expect, it } from "vitest";

import { computeRms, VAD_DEFAULTS, VadSilenceDetector } from "./vad";

// 16 kHz mono chunk builders. A "speech" chunk sits well above the 0.01 RMS
// threshold; a "silence" chunk is flat zero (what a muted/quiet mic yields).
function silence(samples = 800): Float32Array {
  return new Float32Array(samples); // all zeros
}
function speech(amplitude = 0.1, samples = 800): Float32Array {
  const out = new Float32Array(samples);
  // Alternating +/- amplitude → RMS === amplitude.
  for (let i = 0; i < samples; i++) out[i] = i % 2 === 0 ? amplitude : -amplitude;
  return out;
}

describe("computeRms", () => {
  it("is 0 for an empty buffer", () => {
    expect(computeRms(new Float32Array(0))).toBe(0);
  });

  it("is 0 for pure silence", () => {
    expect(computeRms(silence())).toBe(0);
  });

  it("equals the amplitude of a full-scale alternating tone", () => {
    expect(computeRms(speech(0.1))).toBeCloseTo(0.1, 5);
  });

  it("reports speech-level audio above the default RMS threshold", () => {
    expect(computeRms(speech(0.05))).toBeGreaterThan(VAD_DEFAULTS.rmsThreshold);
  });
});

describe("VadSilenceDetector.hasSpeech (silence gate)", () => {
  it("starts false before any audio", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    expect(vad.hasSpeech()).toBe(false);
  });

  it("stays false through a turn of pure silence", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    for (let i = 0; i < 20; i++) vad.push(silence());
    expect(vad.hasSpeech()).toBe(false);
  });

  it("stays false for sub-threshold noise", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    // 0.005 RMS < 0.01 threshold → not speech.
    for (let i = 0; i < 10; i++) vad.push(speech(0.005));
    expect(vad.hasSpeech()).toBe(false);
  });

  it("flips true once a chunk crosses the threshold", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    vad.push(silence());
    expect(vad.hasSpeech()).toBe(false);
    vad.push(speech(0.1));
    expect(vad.hasSpeech()).toBe(true);
  });

  it("counts speech that arrives during the leading grace window", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    // The very first chunk anchors the grace clock, so this is inside grace.
    vad.push(speech(0.1));
    expect(vad.hasSpeech()).toBe(true);
  });

  it("latches true even if speech is later followed by silence", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    vad.push(speech(0.1));
    for (let i = 0; i < 15; i++) vad.push(silence());
    expect(vad.hasSpeech()).toBe(true);
  });

  it("resets to false on start() (turn boundary)", () => {
    const vad = new VadSilenceDetector();
    vad.start();
    vad.push(speech(0.1));
    expect(vad.hasSpeech()).toBe(true);
    vad.start();
    expect(vad.hasSpeech()).toBe(false);
  });
});
