import { describe, expect, it } from "vitest";
import { clampToStage, nextStackOrder, pickSpawnPosition } from "../layout";

describe("studio window layout", () => {
  it("clamps a center-anchored rect inside the stage", () => {
    const rect = clampToStage({ x: -1, y: 2, w: 0.4, h: 0.5 });
    expect(rect.x).toBeCloseTo(0.212);
    expect(rect.y).toBeCloseTo(0.738);
    expect(rect.w).toBe(0.4);
    expect(rect.h).toBe(0.5);
  });

  it("moves successive spawns away from dead center", () => {
    const first = pickSpawnPosition([], { w: 0.4, h: 0.4 });
    const second = pickSpawnPosition([{ ...first }], { w: 0.4, h: 0.4 });
    expect(first).toEqual({ x: 0.5, y: 0.48 });
    expect(Math.hypot(second.x - first.x, second.y - first.y)).toBeGreaterThan(0.2);
  });

  it("raises above the actual highest z value", () => {
    expect(nextStackOrder([{ z: 7 }, { z: 2 }, { z: 11 }])).toBe(12);
  });
});
