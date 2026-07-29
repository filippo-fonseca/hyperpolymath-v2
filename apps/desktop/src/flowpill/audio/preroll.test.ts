import { describe, expect, it } from "vitest";

import { PrerollBuffer } from "./preroll";
import { constantPcm } from "./test-fixtures";

describe("PrerollBuffer", () => {
  it("holds everything while under capacity, in order", () => {
    const ring = new PrerollBuffer(10);
    ring.push(Float32Array.from([1, 2, 3]));
    ring.push(Float32Array.from([4, 5]));
    expect(ring.length).toBe(5);
    expect(Array.from(ring.read())).toEqual([1, 2, 3, 4, 5]);
  });

  it("keeps only the most recent samples once full", () => {
    const ring = new PrerollBuffer(4);
    ring.push(Float32Array.from([1, 2, 3, 4, 5, 6]));
    expect(ring.length).toBe(4);
    expect(Array.from(ring.read())).toEqual([3, 4, 5, 6]);
    ring.push(Float32Array.from([7]));
    expect(Array.from(ring.read())).toEqual([4, 5, 6, 7]);
  });

  it("takes only the tail of a chunk longer than the whole ring", () => {
    const ring = new PrerollBuffer(3);
    ring.push(Float32Array.from([1, 2, 3, 4, 5, 6, 7, 8]));
    expect(Array.from(ring.read())).toEqual([6, 7, 8]);
  });

  it("empties on drain and stays readable afterwards", () => {
    const ring = new PrerollBuffer(4);
    ring.push(constantPcm(4, 0.25));
    const drained = ring.drain();
    expect(drained).toHaveLength(4);
    expect(ring.length).toBe(0);
    expect(ring.read()).toHaveLength(0);
  });

  it("tolerates a zero capacity", () => {
    const ring = new PrerollBuffer(0);
    ring.push(constantPcm(8, 0.5));
    expect(ring.length).toBe(0);
    expect(ring.drain()).toHaveLength(0);
  });

  it("holds 400ms at 16 kHz, the default pre-roll", () => {
    const ring = new PrerollBuffer(6_400);
    ring.push(constantPcm(16_000, 0.1));
    expect(ring.length).toBe(6_400);
  });
});
