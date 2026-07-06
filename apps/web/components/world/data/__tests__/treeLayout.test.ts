import { describe, it, expect } from "vitest";
import {
  solveTreeLayout,
  boughPoint,
  emberShellPosition,
  trunkShellPosition,
  BOUGH_SAG,
  BOUGH_LEN_MIN,
  BOUGH_LEN_MAX,
  BOUGH_ELEV_MIN,
  BOUGH_ELEV_MAX,
  EMBER_SHELL_RADIUS,
  TRUNK_SHELL_RADIUS,
  LANTERN_HANG,
  type BoughLayout,
} from "../treeLayout";
import type { Vector3Tuple } from "three";
import { mkArea, mkProject } from "./_fixtures";
import type { SidebarArea } from "@/lib/db/queries/sidebar";

const EPS = 1e-9;

function dist(a: Vector3Tuple, b: Vector3Tuple): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function elevationDeg(b: BoughLayout): number {
  const L = dist(b.start, b.end);
  return (Math.asin((b.end[1] - b.start[1]) / L) * 180) / Math.PI;
}

// Six-area fixture with varied project counts and non-sequential order indices.
function sixAreas(): SidebarArea[] {
  return [
    mkArea({ id: "a1", orderIndex: 0, projects: [mkProject({ id: "p1a" }), mkProject({ id: "p1b" })] }),
    mkArea({ id: "a2", orderIndex: 1, projects: [] }),
    mkArea({ id: "a3", orderIndex: 2, projects: [mkProject({ id: "p3a" }), mkProject({ id: "p3b" }), mkProject({ id: "p3c" })] }),
    mkArea({ id: "a4", orderIndex: 3, projects: [mkProject({ id: "p4a" })] }),
    mkArea({ id: "a5", orderIndex: 4, projects: [] }),
    mkArea({ id: "a6", orderIndex: 5, projects: [mkProject({ id: "p6a" }), mkProject({ id: "p6b" })] }),
  ];
}

describe("solveTreeLayout — determinism & stability", () => {
  it("is a pure function: same input ⇒ deep-equal + byte-equal output", () => {
    const a = solveTreeLayout(sixAreas());
    const b = solveTreeLayout(sixAreas());
    expect(a.boughs).toEqual(b.boughs);
    expect(JSON.stringify(a.boughs)).toBe(JSON.stringify(b.boughs));
  });

  it("is input-order independent (internal sort owns order)", () => {
    const inOrder = solveTreeLayout(sixAreas());
    const shuffled = solveTreeLayout([...sixAreas()].reverse());
    expect(shuffled.boughs).toEqual(inOrder.boughs);
  });

  it("keeps existing boughs stable when appending a larger-orderIndex area", () => {
    const base = solveTreeLayout(sixAreas());
    const appended = solveTreeLayout([
      ...sixAreas(),
      mkArea({ id: "a7", orderIndex: 99, projects: [] }),
    ]);
    for (const b0 of base.boughs) {
      const b1 = appended.byArea.get(b0.areaId)!;
      expect(b1.azimuth).toBe(b0.azimuth);
      expect(b1.start).toEqual(b0.start);
      expect(b1.end).toEqual(b0.end);
    }
  });

  it("excludes archived areas from boughs and byArea", () => {
    const areas = [
      mkArea({ id: "live", orderIndex: 0 }),
      mkArea({ id: "dead", orderIndex: 1, archivedAt: new Date("2026-01-01") }),
    ];
    const r = solveTreeLayout(areas);
    expect(r.boughs.map((b) => b.areaId)).toEqual(["live"]);
    expect(r.byArea.has("dead")).toBe(false);
  });
});

describe("solveTreeLayout — load scaling", () => {
  it("full bough (8 projects) reaches ~5.0m at ~20° elevation", () => {
    const projects = Array.from({ length: 8 }, (_, i) => mkProject({ id: `p${i}` }));
    const r = solveTreeLayout([mkArea({ id: "heavy", projects })]);
    const b = r.boughs[0]!;
    expect(dist(b.start, b.end)).toBeCloseTo(BOUGH_LEN_MAX, 6);
    expect(elevationDeg(b)).toBeCloseTo(BOUGH_ELEV_MIN, 6);
  });

  it("empty bough (0 projects) is ~3.5m at ~35° elevation", () => {
    const r = solveTreeLayout([mkArea({ id: "light", projects: [] })]);
    const b = r.boughs[0]!;
    expect(dist(b.start, b.end)).toBeCloseTo(BOUGH_LEN_MIN, 6);
    expect(elevationDeg(b)).toBeCloseTo(BOUGH_ELEV_MAX, 6);
  });
});

describe("lantern distribution", () => {
  it("hangs lanterns on the outer 60% of the curve, below the limb", () => {
    const projects = [mkProject({ id: "l1" }), mkProject({ id: "l2" }), mkProject({ id: "l3" })];
    const r = solveTreeLayout([mkArea({ id: "a", projects })]);
    const b = r.boughs[0]!;
    expect(b.projects).toHaveLength(3);

    for (const lantern of b.projects) {
      // Recover t by nearest-point search (undo the vertical hang first).
      const probe: Vector3Tuple = [
        lantern.position[0],
        lantern.position[1] + LANTERN_HANG,
        lantern.position[2],
      ];
      let bestT = 0;
      let bestD = Infinity;
      for (let s = 0; s <= 1; s += 0.001) {
        const d = dist(boughPoint(b, s), probe);
        if (d < bestD) {
          bestD = d;
          bestT = s;
        }
      }
      expect(bestT).toBeGreaterThanOrEqual(0.4 - 0.05);
      expect(bestT).toBeLessThanOrEqual(0.98 + 0.02);
      expect(bestD).toBeLessThan(0.1); // near the curve (only horizontal jitter)
      // Below the limb at that param.
      expect(lantern.position[1]).toBeLessThan(boughPoint(b, bestT)[1]);
    }
  });
});

describe("emberShellPosition", () => {
  it("places every ember exactly EMBER_SHELL_RADIUS from the lantern; all distinct", () => {
    const lantern: Vector3Tuple = [1, 2, 3];
    const n = 5;
    const positions = Array.from({ length: n }, (_, k) =>
      emberShellPosition(lantern, k, n, `task-${k}`),
    );
    for (const p of positions) {
      expect(dist(p, lantern)).toBeCloseTo(EMBER_SHELL_RADIUS, 9);
    }
    const keys = new Set(positions.map((p) => p.join(",")));
    expect(keys.size).toBe(n);
  });
});

describe("trunkShellPosition", () => {
  it("lies on the trunk shell radius with y in [1.2, 2.0]; all distinct", () => {
    const positions = Array.from({ length: 10 }, (_, k) => trunkShellPosition(k));
    for (const p of positions) {
      const xz = Math.sqrt(p[0] * p[0] + p[2] * p[2]);
      expect(xz).toBeCloseTo(TRUNK_SHELL_RADIUS, 9);
      expect(p[1]).toBeGreaterThanOrEqual(1.2 - EPS);
      expect(p[1]).toBeLessThanOrEqual(2.0 + EPS);
    }
    const keys = new Set(positions.map((p) => p.join(",")));
    expect(keys.size).toBe(10);
  });
});

describe("boughPoint", () => {
  it("hits the endpoints and sags to BOUGH_SAG·L/2 below the chord midpoint", () => {
    const r = solveTreeLayout([
      mkArea({ id: "a", projects: [mkProject({ id: "p1" }), mkProject({ id: "p2" })] }),
    ]);
    const b = r.boughs[0]!;
    const L = dist(b.start, b.end);

    const p0 = boughPoint(b, 0);
    const p1 = boughPoint(b, 1);
    expect(dist(p0, b.start)).toBeLessThan(EPS);
    expect(dist(p1, b.end)).toBeLessThan(EPS);

    const mid = boughPoint(b, 0.5);
    const chordMidY = (b.start[1] + b.end[1]) / 2;
    expect(chordMidY - mid[1]).toBeCloseTo(BOUGH_SAG * L * 0.5, 9);
  });
});
