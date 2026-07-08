import { beforeEach, describe, expect, it } from "vitest";

import {
  __resetWidgetTransforms,
  EMPTY_TRANSFORM,
  getWidgetTransform,
  setWidgetTransform,
  subscribeWidgetTransforms,
} from "../widget-transforms";

describe("widget-transforms store", () => {
  beforeEach(() => {
    __resetWidgetTransforms();
  });

  it("returns the shared empty transform for an untouched id", () => {
    expect(getWidgetTransform("tasks")).toBe(EMPTY_TRANSFORM);
    expect(EMPTY_TRANSFORM).toEqual({ position: null });
  });

  it("commits a position override", () => {
    setWidgetTransform("tasks", [1, 2, 3]);
    expect(getWidgetTransform("tasks")).toEqual({ position: [1, 2, 3] });
  });

  it("drops the entry (reverting to the default) when cleared with null", () => {
    setWidgetTransform("journal", [2, 2, 2]);
    setWidgetTransform("journal", null);
    expect(getWidgetTransform("journal")).toBe(EMPTY_TRANSFORM);
  });

  it("notifies subscribers on real changes and is a no-op when unchanged", () => {
    let calls = 0;
    const pos: [number, number, number] = [1, 1, 1];
    const unsub = subscribeWidgetTransforms(() => {
      calls += 1;
    });

    setWidgetTransform("tasks", pos); // change → notify
    setWidgetTransform("tasks", pos); // identical ref → no-op
    setWidgetTransform("tasks", null); // clear → notify
    setWidgetTransform("tasks", null); // already gone → no-op

    unsub();
    setWidgetTransform("captures", [2, 2, 2]); // after unsub → no notify

    expect(calls).toBe(2);
  });

  it("keeps a stable snapshot reference until the id changes", () => {
    const a0: [number, number, number] = [1, 2, 3];
    setWidgetTransform("tasks", a0);
    const a = getWidgetTransform("tasks");
    expect(getWidgetTransform("tasks")).toBe(a); // unchanged → same ref

    setWidgetTransform("captures", [4, 5, 6]); // other id changes
    expect(getWidgetTransform("tasks")).toBe(a); // still stable

    setWidgetTransform("tasks", [7, 8, 9]); // this id changes
    expect(getWidgetTransform("tasks")).not.toBe(a);
  });
});
