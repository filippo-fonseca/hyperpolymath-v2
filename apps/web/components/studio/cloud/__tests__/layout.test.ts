import { describe, expect, it } from "vitest";

import { fibonacciCapSlots, type TileSlot } from "../layout";

const OPTS = {
  radius: 2.4,
  center: [0, 1.8, 0] as [number, number, number],
  capDeg: 70,
};

function dist(a: TileSlot, b: TileSlot): number {
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe("fibonacciCapSlots", () => {
  it("returns exactly `count` slots", () => {
    expect(fibonacciCapSlots(5, OPTS)).toHaveLength(5);
    expect(fibonacciCapSlots(0, OPTS)).toHaveLength(0);
    expect(fibonacciCapSlots(1, OPTS)).toHaveLength(1);
  });

  it("places every tile on the camera-facing cap (z > center.z)", () => {
    for (const slot of fibonacciCapSlots(5, OPTS)) {
      expect(slot.position[2]).toBeGreaterThan(OPTS.center[2]);
    }
  });

  it("keeps every tile at `radius` from the center", () => {
    const c = OPTS.center;
    for (const slot of fibonacciCapSlots(5, OPTS)) {
      const dx = slot.position[0] - c[0];
      const dy = slot.position[1] - c[1];
      const dz = slot.position[2] - c[2];
      const r = Math.sqrt(dx * dx + dy * dy + dz * dz);
      expect(r).toBeCloseTo(OPTS.radius, 5);
    }
  });

  it("spaces the five tiles so 1.4-wide slabs do not overlap (pairwise ≥ 1.2)", () => {
    const slots = fibonacciCapSlots(5, OPTS);
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        expect(dist(slots[i]!, slots[j]!)).toBeGreaterThanOrEqual(1.2);
      }
    }
  });

  it("is deterministic across calls", () => {
    expect(fibonacciCapSlots(5, OPTS)).toEqual(fibonacciCapSlots(5, OPTS));
  });
});
