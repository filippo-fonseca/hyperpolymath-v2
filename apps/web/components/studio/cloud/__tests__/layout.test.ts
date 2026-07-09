import { describe, expect, it } from "vitest";

import { CAMERA_HOME } from "@/lib/studio/camera/traversal";
import {
  arcZoneSlots,
  DEFAULT_ARC_ZONES,
  depthFade,
  nearestZone,
  type TileSlot,
} from "../layout";

type Vec3 = [number, number, number];

// Mirror of WidgetTile's private TILE_W (tile slab width, meters).
const TILE_W = 1.4;

function dist(a: TileSlot, b: TileSlot): number {
  const dx = a.position[0] - b.position[0];
  const dy = a.position[1] - b.position[1];
  const dz = a.position[2] - b.position[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

describe("arcZoneSlots", () => {
  const Z = DEFAULT_ARC_ZONES;

  const planarRadius = (s: TileSlot): number => {
    const dx = s.position[0] - Z.pivot[0];
    const dz = s.position[2] - Z.pivot[2];
    return Math.sqrt(dx * dx + dz * dz);
  };

  it("returns exactly `count` slots", () => {
    expect(arcZoneSlots(8, Z)).toHaveLength(8);
    expect(arcZoneSlots(0, Z)).toHaveLength(0);
    expect(arcZoneSlots(1, Z)).toHaveLength(1);
  });

  it("splits the eight-widget cloud into 4 near + 4 far at the row radii and heights", () => {
    const slots = arcZoneSlots(8, Z);
    const near = slots.slice(0, 4);
    const far = slots.slice(4);
    for (const s of near) {
      expect(s.position[1]).toBeCloseTo(Z.nearY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.nearRadius, 6);
    }
    for (const s of far) {
      expect(s.position[1]).toBeCloseTo(Z.farY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.farRadius, 6);
    }
  });

  it("orders each row left→right (ascending X)", () => {
    const slots = arcZoneSlots(8, Z);
    const near = slots.slice(0, 4).map((s) => s.position[0]);
    const far = slots.slice(4).map((s) => s.position[0]);
    for (let i = 1; i < near.length; i++) expect(near[i]!).toBeGreaterThan(near[i - 1]!);
    for (let i = 1; i < far.length; i++) expect(far[i]!).toBeGreaterThan(far[i - 1]!);
  });

  it("places every slot in front of the camera's nearest travel bound (z < 3.2)", () => {
    // boundsZ[0] = 3.2 is the camera's closest approach; slots must sit ahead of it.
    for (const s of arcZoneSlots(8, Z)) {
      expect(s.position[2]).toBeLessThan(3.2);
    }
  });

  it("spaces all eight slots so 1.4-wide slabs never overlap (min center distance > TILE_W)", () => {
    const slots = arcZoneSlots(8, Z);
    let min = Infinity;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        min = Math.min(min, dist(slots[i]!, slots[j]!));
      }
    }
    expect(min).toBeGreaterThan(TILE_W);
  });

  it("handles odd counts by giving the near row the ceil half (7 → 4+3, 9 → 5+4)", () => {
    const seven = arcZoneSlots(7, Z);
    expect(seven).toHaveLength(7);
    expect(seven.slice(0, 4).every((s) => s.position[1] === Z.nearY)).toBe(true);
    expect(seven.slice(4).every((s) => s.position[1] === Z.farY)).toBe(true);

    const nine = arcZoneSlots(9, Z);
    expect(nine).toHaveLength(9);
    expect(nine.slice(0, 5).every((s) => s.position[1] === Z.nearY)).toBe(true);
    expect(nine.slice(5).every((s) => s.position[1] === Z.farY)).toBe(true);
  });

  it("is deterministic across calls", () => {
    expect(arcZoneSlots(8, Z)).toEqual(arcZoneSlots(8, Z));
    expect(arcZoneSlots(5, Z, 1)).toEqual(arcZoneSlots(5, Z, 1));
  });
});

describe("arcZoneSlots frontRow swap", () => {
  const Z = DEFAULT_ARC_ZONES;

  const planarRadius = (s: TileSlot): number => {
    const dx = s.position[0] - Z.pivot[0];
    const dz = s.position[2] - Z.pivot[2];
    return Math.sqrt(dx * dx + dz * dz);
  };

  it("defaults frontRow to 0 — identical to the two-arg call", () => {
    expect(arcZoneSlots(8, Z, 0)).toEqual(arcZoneSlots(8, Z));
    expect(arcZoneSlots(5, Z, 0)).toEqual(arcZoneSlots(5, Z));
  });

  it("frontRow 1 at count 8 renders zones 0..3 at the far row and 4..7 at the near row", () => {
    const slots = arcZoneSlots(8, Z, 1);
    for (const s of slots.slice(0, 4)) {
      expect(s.position[1]).toBeCloseTo(Z.farY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.farRadius, 6);
    }
    for (const s of slots.slice(4)) {
      expect(s.position[1]).toBeCloseTo(Z.nearY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.nearRadius, 6);
    }
  });

  it("frontRow 1 at count 5 (3+2) brings the 2-group to the near geometry", () => {
    const slots = arcZoneSlots(5, Z, 1);
    // group 0 = zones 0..2 → far; group 1 = zones 3..4 → near.
    for (const s of slots.slice(0, 3)) {
      expect(s.position[1]).toBeCloseTo(Z.farY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.farRadius, 6);
    }
    for (const s of slots.slice(3)) {
      expect(s.position[1]).toBeCloseTo(Z.nearY, 6);
      expect(planarRadius(s)).toBeCloseTo(Z.nearRadius, 6);
    }
  });

  it("ignores frontRow when the second group is empty (count 0 and 1)", () => {
    expect(arcZoneSlots(0, Z, 1)).toEqual([]);
    const one = arcZoneSlots(1, Z, 1);
    expect(one).toHaveLength(1);
    // Lone group always sits at the near geometry regardless of frontRow.
    expect(one[0]!.position[1]).toBeCloseTo(Z.nearY, 6);
    expect(planarRadius(one[0]!)).toBeCloseTo(Z.nearRadius, 6);
    expect(one).toEqual(arcZoneSlots(1, Z, 0));
  });

  it("keeps slots non-overlapping and in front of the camera for BOTH frontRow values (counts 8 and 5)", () => {
    for (const count of [8, 5]) {
      for (const fr of [0, 1] as const) {
        const slots = arcZoneSlots(count, Z, fr);
        for (const s of slots) {
          expect(s.position[2]).toBeLessThan(3.2);
        }
        let min = Infinity;
        for (let i = 0; i < slots.length; i++) {
          for (let j = i + 1; j < slots.length; j++) {
            min = Math.min(min, dist(slots[i]!, slots[j]!));
          }
        }
        expect(min).toBeGreaterThan(TILE_W);
      }
    }
  });
});

describe("nearestZone", () => {
  const slots = arcZoneSlots(8, DEFAULT_ARC_ZONES);

  it("returns the index of the closest slot center", () => {
    expect(nearestZone(slots[5]!.position, slots)).toBe(5);
  });

  it("picks by 3D distance when a point sits between two slots", () => {
    const a = slots[0]!.position;
    const b = slots[1]!.position;
    const mid: Vec3 = [
      (a[0] + b[0]) / 2 + (a[0] < b[0] ? -0.01 : 0.01), // nudge toward slot 0
      (a[1] + b[1]) / 2,
      (a[2] + b[2]) / 2,
    ];
    expect(nearestZone(mid, slots)).toBe(0);
  });

  it("resolves an exact tie to the lower index", () => {
    const a = slots[2]!.position;
    const b = slots[3]!.position;
    const mid: Vec3 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
    expect(nearestZone(mid, slots)).toBe(2);
  });

  it("returns -1 for an empty slot list", () => {
    expect(nearestZone([0, 0, 0], [])).toBe(-1);
  });
});

describe("depthFade", () => {
  const Z = DEFAULT_ARC_ZONES;
  const atDist = (d: number): Vec3 => [CAMERA_HOME[0], CAMERA_HOME[1], CAMERA_HOME[2] - d];

  it("is 1 within fadeNear and floors at fadeMinOpacity beyond fadeFar", () => {
    expect(depthFade(atDist(Z.fadeNear - 0.5), Z)).toBe(1);
    expect(depthFade(atDist(Z.fadeFar + 2), Z)).toBe(Z.fadeMinOpacity);
  });

  it("eases to the midpoint value halfway through the transition band", () => {
    const f = depthFade(atDist((Z.fadeNear + Z.fadeFar) / 2), Z);
    expect(f).toBeGreaterThan(Z.fadeMinOpacity);
    expect(f).toBeLessThan(1);
    expect(f).toBeCloseTo(1 + 0.5 * (Z.fadeMinOpacity - 1), 6);
  });

  it("is monotone non-increasing in distance and clamped to [fadeMinOpacity, 1]", () => {
    let prev = 1;
    for (let d = 0; d <= 10; d += 0.5) {
      const f = depthFade(atDist(d), Z);
      expect(f).toBeLessThanOrEqual(1 + 1e-9);
      expect(f).toBeGreaterThanOrEqual(Z.fadeMinOpacity - 1e-9);
      expect(f).toBeLessThanOrEqual(prev + 1e-9);
      prev = f;
    }
  });

  it("gives real arc slots a near-brighter-than-far gradient, all within the clamp", () => {
    const slots = arcZoneSlots(8, Z);
    const fades = slots.map((s) => depthFade(s.position, Z));
    const avg = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;
    expect(avg(fades.slice(0, 4))).toBeGreaterThan(avg(fades.slice(4)));
    for (const f of fades) {
      expect(f).toBeGreaterThanOrEqual(Z.fadeMinOpacity);
      expect(f).toBeLessThanOrEqual(1);
    }
  });
});
