import { describe, expect, it } from "vitest";

import { snapToCommit } from "../manipulation-math";

type Vec3 = [number, number, number];

describe("snapToCommit", () => {
  const anchors: Vec3[] = [
    [0, 0, 0],
    [2, 0, 0],
    [4, 0, 0],
  ];
  const released: Vec3 = [3.9, 0.1, 0];

  it("settles freeform (the released point) when there is no snap", () => {
    expect(snapToCommit(null, 2, anchors, released)).toEqual([3.9, 0.1, 0]);
  });

  it("clears the override (null) when snapped to the widget's own slot", () => {
    expect(snapToCommit(2, 2, anchors, released)).toBeNull();
  });

  it("returns the anchor position when snapped to another slot", () => {
    expect(snapToCommit(1, 2, anchors, released)).toEqual([2, 0, 0]);
  });
});
