import { describe, expect, it } from "vitest";

import {
  BLOCK_RADIUS,
  fibonacciCapSlots,
  resolveSnap,
  SNAP_RADIUS,
  type TileSlot,
} from "../layout";

type Vec3 = [number, number, number];

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

  it("holds all invariants for the eight-widget cloud", () => {
    const slots = fibonacciCapSlots(8, OPTS);
    expect(slots).toHaveLength(8);
    for (const slot of slots) {
      expect(slot.position[2]).toBeGreaterThan(OPTS.center[2]);
    }
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

describe("resolveSnap", () => {
  // Three well-separated anchors on a line (spacing 2 ≫ BLOCK_RADIUS).
  const anchors: Vec3[] = [
    [0, 0, 0],
    [2, 0, 0],
    [4, 0, 0],
  ];

  it("snaps to the nearest anchor when released within snapRadius", () => {
    const released: Vec3 = [2 + SNAP_RADIUS * 0.5, 0, 0];
    expect(resolveSnap(released, anchors, [])).toBe(1);
  });

  it("returns null when released outside every anchor's snapRadius", () => {
    const released: Vec3 = [1, 0, 0]; // 1.0 from anchors 0 and 1, both > SNAP_RADIUS
    expect(resolveSnap(released, anchors, [])).toBeNull();
  });

  it("treats the snapRadius boundary as inclusive", () => {
    const released: Vec3 = [SNAP_RADIUS, 0, 0]; // exactly SNAP_RADIUS from anchor 0
    expect(resolveSnap(released, anchors, [])).toBe(0);
  });

  it("skips a blocked anchor and picks the next eligible in range", () => {
    // Released is nearest anchor 1, but a widget occupies anchor 1 → blocked;
    // anchor 0 is still in range and clear. Explicit opts isolate the branch
    // (with default radii two in-range anchors always cross-block each other).
    const line: Vec3[] = [
      [0, 0, 0],
      [1, 0, 0],
    ];
    const released: Vec3 = [0.6, 0, 0]; // nearest anchor 1 (0.4) then anchor 0 (0.6)
    const others: Vec3[] = [[1, 0, 0]]; // occupies anchor 1
    expect(
      resolveSnap(released, line, others, { snapRadius: 1, blockRadius: 0.3 }),
    ).toBe(0);
  });

  it("returns null when the only in-range anchor is blocked", () => {
    const released: Vec3 = [2 + SNAP_RADIUS * 0.4, 0, 0];
    const others: Vec3[] = [[2, 0, 0]]; // a widget on anchor 1
    expect(resolveSnap(released, anchors, others)).toBeNull();
  });

  it("prefers the widget's own slot when released near it (nearest, and never self-blocked)", () => {
    // Widget released just off its own slot (anchor 2); the OTHER widgets sit on
    // their slots (0 and 1) — far enough not to block anchor 2.
    const released: Vec3 = [4 - SNAP_RADIUS * 0.3, 0, 0];
    const others: Vec3[] = [
      [0, 0, 0],
      [2, 0, 0],
    ];
    expect(resolveSnap(released, anchors, others)).toBe(2);
  });

  it("does not block on a far widget (beyond blockRadius)", () => {
    const released: Vec3 = [SNAP_RADIUS * 0.3, 0, 0];
    const others: Vec3[] = [[BLOCK_RADIUS + 0.5, 0, 0]]; // clearly beyond blockRadius
    expect(resolveSnap(released, anchors, others)).toBe(0);
  });
});
