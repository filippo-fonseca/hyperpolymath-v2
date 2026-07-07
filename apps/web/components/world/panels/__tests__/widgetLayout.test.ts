import { describe, it, expect } from "vitest";
import type { Vector3Tuple } from "three";
import type { WidgetId } from "../widgetTypes";
import {
  solveBenchLayout,
  neighborOf,
  nearestSlotIndex,
  slotAngles,
  DEFAULT_BENCH_CONFIG,
  SLOT_STEP_RAD,
  SLOT_CLEARANCE_RAD,
  READ_DISTANCE,
  PITCH_RISE,
  MAX_ARC_RAD,
} from "../widgetLayout";

const EPS = 1e-9;
const ROSTER: WidgetId[] = ["tasks", "captures", "agenda", "habits", "journal"];

// The aisle centerline (horizontal), from the default center toward the trunk at
// the origin. Used to re-derive each slot's offset angle from its solved position.
function aisleDir(center: Vector3Tuple): [number, number] {
  const ax = -center[0];
  const az = -center[2];
  const mag = Math.hypot(ax, az);
  return mag < EPS ? [0, -1] : [ax / mag, az / mag];
}

// Unsigned angle between a slot's radial direction and the aisle centerline.
function offsetFromAisle(pos: Vector3Tuple, center: Vector3Tuple): number {
  const dx = pos[0] - center[0];
  const dz = pos[2] - center[2];
  const mag = Math.hypot(dx, dz);
  const [ax, az] = aisleDir(center);
  const dot = (dx / mag) * ax + (dz / mag) * az;
  return Math.acos(Math.min(1, Math.max(-1, dot)));
}

function horizDist(a: Vector3Tuple, b: Vector3Tuple): number {
  return Math.hypot(b[0] - a[0], b[2] - a[2]);
}

describe("solveBenchLayout — totality & determinism", () => {
  it("is total for 1..7 widgets (never throws, one slot per widget)", () => {
    for (let n = 1; n <= 7; n++) {
      const order = ROSTER.concat(["tasks", "captures"]).slice(0, n);
      const slots = solveBenchLayout(order);
      expect(slots).toHaveLength(n);
      slots.forEach((s, i) => {
        expect(s.index).toBe(i);
        expect(s.widgetId).toBe(order[i]);
      });
    }
  });

  it("clamps an over-long order to maxSlots (7)", () => {
    const order = ([] as WidgetId[]).concat(
      ...Array.from({ length: 3 }, () => ROSTER),
    ); // 15 entries
    const slots = solveBenchLayout(order);
    expect(slots).toHaveLength(7);
  });

  it("returns [] for an empty order", () => {
    expect(solveBenchLayout([])).toEqual([]);
  });

  it("is a pure function: same input ⇒ deep-equal + byte-equal output", () => {
    const a = solveBenchLayout(ROSTER);
    const b = solveBenchLayout(ROSTER);
    expect(a).toEqual(b);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe("solveBenchLayout — aisle clearance (§W-02: no slot within aisleRad/2 of the Tree)", () => {
  it("keeps every slot outside the aisle half-angle for all 1..7", () => {
    const half = DEFAULT_BENCH_CONFIG.aisleRad / 2;
    for (let n = 1; n <= 7; n++) {
      const order = ROSTER.concat(["tasks", "captures"]).slice(0, n);
      for (const slot of solveBenchLayout(order)) {
        const off = offsetFromAisle(slot.position, DEFAULT_BENCH_CONFIG.center);
        expect(off).toBeGreaterThanOrEqual(half - EPS);
        // The innermost slot sits exactly a clearance beyond the aisle edge.
        expect(off).toBeGreaterThanOrEqual(half + SLOT_CLEARANCE_RAD - EPS);
      }
    }
  });

  it("frames the trunk dead-center: no slot straddles the aisle centerline", () => {
    for (const slot of solveBenchLayout(ROSTER)) {
      expect(Math.abs(slot.rotation[1])).toBeGreaterThan(EPS);
    }
  });
});

describe("solveBenchLayout — symmetry around the aisle (even bench)", () => {
  // 4 widgets → 2 per wing, a mirror-symmetric set of angles.
  const four: WidgetId[] = ["tasks", "captures", "agenda", "habits"];

  it("slot angles are a mirror-symmetric set", () => {
    const angles = slotAngles(four);
    // index 0..3 run leftmost→rightmost: [-outer, -inner, +inner, +outer]
    expect(angles[0]).toBeCloseTo(-angles[3]!, 12);
    expect(angles[1]).toBeCloseTo(-angles[2]!, 12);
    expect(angles[1]).toBeCloseTo(-(DEFAULT_BENCH_CONFIG.aisleRad / 2 + SLOT_CLEARANCE_RAD), 12);
    expect(angles[0]).toBeCloseTo(angles[1]! - SLOT_STEP_RAD, 12);
  });

  it("mirrored slots share height & radius and mirror across the aisle plane", () => {
    const slots = solveBenchLayout(four);
    const c = DEFAULT_BENCH_CONFIG.center;
    const pairs: [number, number][] = [
      [0, 3],
      [1, 2],
    ];
    for (const [l, r] of pairs) {
      const L = slots[l]!;
      const R = slots[r]!;
      // Same height, same distance from center; the aisle here lies on the z
      // axis (center on +z, trunk at origin), so mirroring negates x, keeps z.
      expect(L.position[1]).toBeCloseTo(R.position[1], 12);
      expect(horizDist(L.position, c)).toBeCloseTo(horizDist(R.position, c), 12);
      expect(L.position[0]).toBeCloseTo(-R.position[0], 12);
      expect(L.position[2]).toBeCloseTo(R.position[2], 12);
      // Facing rotations are mirror images.
      expect(L.rotation[1]).toBeCloseTo(-R.rotation[1], 12);
    }
  });
});

describe("solveBenchLayout — camera reading pose", () => {
  it("targets the panel center from ~READ_DISTANCE at a slight downward pitch", () => {
    for (const slot of solveBenchLayout(ROSTER)) {
      // Target is the panel center at eye height.
      expect(slot.cameraPose.target).toEqual(slot.position);
      expect(slot.cameraPose.target[1]).toBeCloseTo(DEFAULT_BENCH_CONFIG.eyeY, 12);
      // Eye sits READ_DISTANCE from the panel, horizontally, along its radial.
      expect(horizDist(slot.cameraPose.position, slot.position)).toBeCloseTo(READ_DISTANCE, 9);
      // Eye rides slightly above the panel center → downward pitch, flat read.
      expect(slot.cameraPose.position[1]).toBeCloseTo(DEFAULT_BENCH_CONFIG.eyeY + PITCH_RISE, 12);
      expect(slot.cameraPose.position[1]).toBeGreaterThan(slot.cameraPose.target[1]);
    }
  });
});

describe("solveBenchLayout — the 7-widget bench stays within the arc", () => {
  it("all offsets are ordered, non-wrapping, and within ±MAX_ARC_RAD", () => {
    const seven: WidgetId[] = [
      "tasks",
      "captures",
      "agenda",
      "habits",
      "journal",
      "tasks",
      "captures",
    ];
    const angles = slotAngles(seven);
    expect(angles).toHaveLength(7);
    // Strictly increasing left→right (no two slots collide).
    for (let i = 1; i < angles.length; i++) {
      expect(angles[i]!).toBeGreaterThan(angles[i - 1]!);
    }
    // Never wrap behind past the arc bound.
    for (const a of angles) {
      expect(Math.abs(a)).toBeLessThan(MAX_ARC_RAD);
    }
  });
});

describe("neighborOf — swipe navigation (§4.3)", () => {
  it("returns null past both arc edges (the soft no-op)", () => {
    expect(neighborOf(ROSTER, "tasks", -1)).toBeNull(); // leftmost, prev → null
    expect(neighborOf(ROSTER, "journal", 1)).toBeNull(); // rightmost, next → null
  });

  it("steps to the adjacent widget in the interior", () => {
    expect(neighborOf(ROSTER, "tasks", 1)).toBe("captures");
    expect(neighborOf(ROSTER, "agenda", -1)).toBe("captures");
    expect(neighborOf(ROSTER, "agenda", 1)).toBe("habits");
    expect(neighborOf(ROSTER, "journal", -1)).toBe("habits");
  });

  it("from the vestibule (null current), focuses the near wing's innermost slot", () => {
    // ROSTER n=5 → leftCount 2: innermost-left = index 1 (captures), innermost-right = index 2 (agenda).
    expect(neighborOf(ROSTER, null, 1)).toBe("agenda");
    expect(neighborOf(ROSTER, null, -1)).toBe("captures");
  });

  it("returns null for an unknown current or an empty bench", () => {
    expect(neighborOf(ROSTER, "nutrition" as WidgetId, 1)).toBeNull();
    expect(neighborOf([], null, 1)).toBeNull();
  });
});

describe("nearestSlotIndex — drop resolution (§4.4) truth table", () => {
  const angles = slotAngles(ROSTER); // [ -inner-step, -inner, +inner, +inner+step, +inner+2step ]
  const half = DEFAULT_BENCH_CONFIG.aisleRad / 2;

  it("returns each slot's own index when the yaw lands on it", () => {
    angles.forEach((a, i) => {
      expect(nearestSlotIndex(ROSTER, a)).toBe(i);
    });
  });

  it("resolves an in-aisle yaw to the adjacent edge slot on its side", () => {
    // Yaws well inside the aisle (|yaw| < half) but leaning right/left.
    const insideRight = half * 0.3;
    const insideLeft = -half * 0.3;
    expect(nearestSlotIndex(ROSTER, insideRight)).toBe(2); // innermost-right
    expect(nearestSlotIndex(ROSTER, insideLeft)).toBe(1); // innermost-left
  });

  it("resolves a dead-center yaw deterministically to the left edge slot", () => {
    expect(nearestSlotIndex(ROSTER, 0)).toBe(1); // tie → lower (left) index
  });

  it("clamps a yaw past the outermost slot to that outer slot", () => {
    expect(nearestSlotIndex(ROSTER, MAX_ARC_RAD)).toBe(ROSTER.length - 1); // far right
    expect(nearestSlotIndex(ROSTER, -MAX_ARC_RAD)).toBe(0); // far left
  });

  it("returns -1 for an empty bench", () => {
    expect(nearestSlotIndex([], 0)).toBe(-1);
  });
});
