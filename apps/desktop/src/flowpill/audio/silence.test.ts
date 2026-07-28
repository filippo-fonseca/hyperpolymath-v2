import { describe, expect, it } from "vitest";

import { SilenceWatcher, bufferHasSpeech } from "./silence";
import { constantPcm, silentPcm, tonePcm } from "./test-fixtures";

const params = { sampleRate: 16_000, rmsThreshold: 0.01, silenceHintMs: 500 };

describe("SilenceWatcher", () => {
  it("raises the hint once continuous silence passes the window", () => {
    const watcher = new SilenceWatcher(params);
    // 500ms at 16 kHz is 8000 samples. Four 1600-sample chunks are not enough.
    for (let i = 0; i < 4; i++) expect(watcher.push(silentPcm(1_600))).toBeNull();
    expect(watcher.push(silentPcm(1_600))).toBeCloseTo(500, 5);
  });

  it("raises the hint only once per run of silence", () => {
    const watcher = new SilenceWatcher(params);
    watcher.push(silentPcm(8_000));
    expect(watcher.push(silentPcm(1_600))).toBeNull();
  });

  it("re-arms after speech, so a second pause is reported too", () => {
    const watcher = new SilenceWatcher(params);
    expect(watcher.push(silentPcm(8_000))).not.toBeNull();
    watcher.push(tonePcm(1_600));
    expect(watcher.silentMs()).toBe(0);
    expect(watcher.push(silentPcm(8_000))).not.toBeNull();
  });

  it("never reports a hint while the user is speaking", () => {
    const watcher = new SilenceWatcher(params);
    for (let i = 0; i < 20; i++) expect(watcher.push(tonePcm(1_600))).toBeNull();
    expect(watcher.hasSpeech()).toBe(true);
  });

  it("reports no speech for a session of pure silence", () => {
    const watcher = new SilenceWatcher(params);
    watcher.push(silentPcm(16_000));
    expect(watcher.hasSpeech()).toBe(false);
  });
});

describe("bufferHasSpeech", () => {
  it("is false for an empty or silent buffer", () => {
    expect(bufferHasSpeech(new Float32Array(0), 0.01)).toBe(false);
    expect(bufferHasSpeech(silentPcm(32_000), 0.01)).toBe(false);
  });

  it("is true when a single window of a long quiet buffer carries speech", () => {
    const buf = silentPcm(32_000);
    buf.set(constantPcm(1_600, 0.2), 16_000);
    expect(bufferHasSpeech(buf, 0.01)).toBe(true);
  });

  it("is false for a buffer whose energy never crosses the threshold", () => {
    expect(bufferHasSpeech(constantPcm(32_000, 0.001), 0.01)).toBe(false);
  });
});
