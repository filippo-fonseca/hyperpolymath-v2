import { describe, expect, it } from "vitest";

import { SCALE_MAX, SCALE_MIN } from "@/lib/studio/state/widget-transforms";
import {
  commitScaleValue,
  effectiveScale,
  resolvePullTarget,
  snapToCommit,
} from "../manipulation-math";

type Vec3 = [number, number, number];

describe("effectiveScale", () => {
  it("is identity at zero net delta", () => {
    expect(effectiveScale(1, 0, 0)).toBe(1);
    expect(effectiveScale(1.2, 0.5, 0.5)).toBeCloseTo(1.2, 10);
  });

  it("doubles per +1 of net delta and halves per −1 (log2 semantics)", () => {
    expect(effectiveScale(0.7, 1, 0)).toBeCloseTo(1.4, 10); // 0.7 * 2
    expect(effectiveScale(1.4, -1, 0)).toBeCloseTo(0.7, 10); // 1.4 / 2
  });

  it("clamps to the scale bounds", () => {
    expect(effectiveScale(1, 5, 0)).toBe(SCALE_MAX); // huge grow → max
    expect(effectiveScale(1, -5, 0)).toBe(SCALE_MIN); // huge shrink → min
  });
});

describe("pull rebase on grab (no pop, then smooth ramp)", () => {
  it("keeps scale continuous when a grab retargets mid-pull", () => {
    // Phase A: pull owns the active widget (base 1, offset 0). Ramp to delta 0.5.
    const activeBase = 1;
    const atGrabDelta = 0.5;
    const beforeGrab = effectiveScale(activeBase, atGrabDelta, 0);
    expect(beforeGrab).toBeCloseTo(Math.SQRT2, 10); // 2^0.5

    // Grab retargets to a widget whose committed base is 1.2; rebase offset to
    // the live delta at the moment of grab. Effective at that instant = base
    // (no pop), regardless of how far the pull had already ramped.
    const grabbedBase = 1.2;
    const rebaseOffset = atGrabDelta;
    expect(effectiveScale(grabbedBase, atGrabDelta, rebaseOffset)).toBeCloseTo(
      grabbedBase,
      10,
    );

    // Continuing the pull past the grab grows the grabbed widget from its base
    // (a modest +0.3 net delta stays inside the clamp bounds).
    expect(
      effectiveScale(grabbedBase, atGrabDelta + 0.3, rebaseOffset),
    ).toBeCloseTo(grabbedBase * Math.pow(2, 0.3), 10);
  });

  it("clamps the rebased ramp to the bounds", () => {
    // Grabbed base near the ceiling; a further grow is clamped, not runaway.
    expect(effectiveScale(1.6, 3, 0)).toBe(SCALE_MAX);
  });
});

describe("resolvePullTarget", () => {
  it("prefers the grabbed widget over the active one", () => {
    expect(resolvePullTarget("tasks", "captures")).toBe("tasks");
  });

  it("falls back to the active widget when no grab is in flight", () => {
    expect(resolvePullTarget(null, "captures")).toBe("captures");
  });

  it("is a no-op target when neither is present (idle pinch over nothing)", () => {
    expect(resolvePullTarget(null, null)).toBeNull();
  });
});

describe("commitScaleValue", () => {
  it("drops the override when within epsilon of 1", () => {
    expect(commitScaleValue(1)).toBeNull();
    expect(commitScaleValue(1.005)).toBeNull();
    expect(commitScaleValue(0.995)).toBeNull();
  });

  it("keeps a meaningful scale", () => {
    expect(commitScaleValue(1.4)).toBe(1.4);
    expect(commitScaleValue(0.7)).toBe(0.7);
  });
});

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
