import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetTransforms,
  clampScale,
  EMPTY_TRANSFORM,
  getWidgetTransform,
  SCALE_MAX,
  SCALE_MIN,
  setWidgetTransform,
  subscribeWidgetTransforms,
} from "../widget-transforms";

describe("widget-transforms store", () => {
  beforeEach(() => {
    __resetWidgetTransforms();
  });

  it("returns the shared empty transform for an untouched id", () => {
    expect(getWidgetTransform("tasks")).toBe(EMPTY_TRANSFORM);
    expect(EMPTY_TRANSFORM).toEqual({ position: null, scale: null });
  });

  it("commits a position override", () => {
    setWidgetTransform("tasks", { position: [1, 2, 3] });
    expect(getWidgetTransform("tasks")).toEqual({
      position: [1, 2, 3],
      scale: null,
    });
  });

  it("commits a scale override", () => {
    setWidgetTransform("captures", { scale: 1.4 });
    expect(getWidgetTransform("captures")).toEqual({
      position: null,
      scale: 1.4,
    });
  });

  it("merges channels — an absent field is left unchanged", () => {
    setWidgetTransform("agenda", { position: [0, 1, 0] });
    setWidgetTransform("agenda", { scale: 1.2 });
    expect(getWidgetTransform("agenda")).toEqual({
      position: [0, 1, 0],
      scale: 1.2,
    });
  });

  it("clears a single channel with an explicit null, keeping the other", () => {
    setWidgetTransform("habits", { position: [1, 1, 1], scale: 1.3 });
    setWidgetTransform("habits", { position: null });
    expect(getWidgetTransform("habits")).toEqual({
      position: null,
      scale: 1.3,
    });
  });

  it("drops the entry (reverting to defaults) when both channels are null", () => {
    setWidgetTransform("journal", { position: [2, 2, 2], scale: 1.5 });
    setWidgetTransform("journal", { position: null, scale: null });
    expect(getWidgetTransform("journal")).toBe(EMPTY_TRANSFORM);
  });

  it("notifies subscribers on real changes and is a no-op when unchanged", () => {
    let calls = 0;
    const unsub = subscribeWidgetTransforms(() => {
      calls += 1;
    });

    setWidgetTransform("tasks", { scale: 1.2 }); // change → notify
    setWidgetTransform("tasks", { scale: 1.2 }); // identical → no-op
    setWidgetTransform("tasks", { position: null, scale: null }); // clear → notify
    setWidgetTransform("tasks", { position: null, scale: null }); // already gone → no-op

    unsub();
    setWidgetTransform("captures", { scale: 1.1 }); // after unsub → no notify

    expect(calls).toBe(2);
  });

  it("keeps a stable snapshot reference until the id changes", () => {
    setWidgetTransform("tasks", { scale: 1.2 });
    const a = getWidgetTransform("tasks");
    expect(getWidgetTransform("tasks")).toBe(a); // unchanged → same ref

    setWidgetTransform("captures", { scale: 1.3 }); // other id changes
    expect(getWidgetTransform("tasks")).toBe(a); // still stable

    setWidgetTransform("tasks", { scale: 1.4 }); // this id changes
    expect(getWidgetTransform("tasks")).not.toBe(a);
  });
});

describe("clampScale", () => {
  it("passes through values inside the bounds (identity)", () => {
    expect(clampScale(1)).toBe(1);
    expect(clampScale(1.2)).toBe(1.2);
    expect(clampScale(SCALE_MIN)).toBe(SCALE_MIN);
    expect(clampScale(SCALE_MAX)).toBe(SCALE_MAX);
  });

  it("clamps below the minimum", () => {
    expect(clampScale(0.1)).toBe(SCALE_MIN);
    expect(clampScale(-5)).toBe(SCALE_MIN);
  });

  it("clamps above the maximum", () => {
    expect(clampScale(3)).toBe(SCALE_MAX);
    expect(clampScale(100)).toBe(SCALE_MAX);
  });
});
