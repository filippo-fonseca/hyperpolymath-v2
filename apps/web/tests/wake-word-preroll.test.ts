/**
 * Phase 12 / WAKE-03 — 500 ms pre-roll splice.
 *
 * Wave 0 (TDD RED): spliceRingPreroll does not yet exist as an export
 * from wake-word-client.ts. Task 4 lands it and brings this suite GREEN.
 *
 * Contract under test: given a 3-second main-thread ring buffer (48000
 * samples @ 16 kHz) and a monotonic write index, spliceRingPreroll
 * returns the LAST `samples` PCM values in chronological order — even
 * across the wrap boundary.
 */
import { describe, expect, it } from "vitest";
import { spliceRingPreroll } from "@/lib/voice/wake-word-client";

describe("WAKE-03 pre-roll splice", () => {
  it("returns last 8000 samples chronologically when no wrap", () => {
    const ring = new Float32Array(48000);
    for (let i = 0; i < 48000; i++) ring[i] = i;
    const writeIdx = { current: 48000 };
    const out = spliceRingPreroll(ring, writeIdx, 8000);
    expect(out.length).toBe(8000);
    expect(out[0]).toBe(40000);
    expect(out[7999]).toBe(47999);
  });

  it("returns last 8000 samples chronologically across wrap", () => {
    const ring = new Float32Array(48000);
    // After 50000 writes:
    //   ring[i] holds the most recent write at position (i)
    //   For i in [0..1999], the most recent write is sample number 48000+i
    //   For i in [2000..47999], the most recent write is sample number i
    for (let i = 0; i < 50000; i++) ring[i % 48000] = i;
    const writeIdx = { current: 50000 };
    const out = spliceRingPreroll(ring, writeIdx, 8000);
    expect(out.length).toBe(8000);
    // Last 8000 writes are sample numbers 42000..49999 in chronological order
    expect(out[0]).toBe(42000);
    expect(out[7999]).toBe(49999);
    // Spot check a middle sample
    expect(out[1000]).toBe(43000);
  });

  it("returns last 8000 samples chronologically when wrap happens exactly mid-window", () => {
    const ring = new Float32Array(48000);
    // After 52000 writes:
    //   sample numbers 44000..51999 are the last 8000 in chronological order
    //   In ring storage, that's positions 44000..47999 (samples 44000..47999)
    //   followed by positions 0..3999 (samples 48000..51999)
    for (let i = 0; i < 52000; i++) ring[i % 48000] = i;
    const writeIdx = { current: 52000 };
    const out = spliceRingPreroll(ring, writeIdx, 8000);
    expect(out[0]).toBe(44000);
    expect(out[3999]).toBe(47999);
    expect(out[4000]).toBe(48000);
    expect(out[7999]).toBe(51999);
  });

  it("returned Float32Array length matches requested samples", () => {
    const ring = new Float32Array(48000);
    const writeIdx = { current: 12345 };
    expect(spliceRingPreroll(ring, writeIdx, 8000).length).toBe(8000);
    expect(spliceRingPreroll(ring, writeIdx, 100).length).toBe(100);
  });
});
