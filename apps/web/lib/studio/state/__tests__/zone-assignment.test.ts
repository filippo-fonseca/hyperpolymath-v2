import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";
import {
  __resetZoneAssignment,
  getDndState,
  getZoneAssignment,
  moveWidgetToZone,
  reflowAssignment,
  setDndState,
  subscribeDndState,
  subscribeZoneAssignment,
} from "../zone-assignment";

describe("zone-assignment store", () => {
  beforeEach(() => {
    __resetZoneAssignment();
  });

  describe("initial state", () => {
    it("seeds the assignment as widget i in zone i (canonical order)", () => {
      expect(getZoneAssignment()).toEqual([...STUDIO_WIDGET_ORDER]);
    });

    it("starts idle with a null drag state", () => {
      expect(getDndState()).toEqual({ grabbedId: null, nearestZone: null });
    });
  });

  describe("reflowAssignment (pure insert-and-shift)", () => {
    it("shifts the intervening cards back by one when moving forward", () => {
      const next = reflowAssignment([...STUDIO_WIDGET_ORDER], "tasks", 2);
      expect(next).toEqual([
        "captures",
        "agenda",
        "tasks",
        "habits",
        "journal",
        "projects",
        "areas",
        "people",
      ]);
    });

    it("shifts the intervening cards forward by one when moving backward", () => {
      const next = reflowAssignment([...STUDIO_WIDGET_ORDER], "people", 2);
      expect(next).toEqual([
        "tasks",
        "captures",
        "people",
        "agenda",
        "habits",
        "journal",
        "projects",
        "areas",
      ]);
    });

    it("clamps an out-of-range target to the last slot", () => {
      const next = reflowAssignment([...STUDIO_WIDGET_ORDER], "tasks", 99);
      expect(next).toHaveLength(STUDIO_WIDGET_ORDER.length);
      expect(next[next.length - 1]).toBe("tasks");
    });

    it("returns the same reference for a move to the current zone", () => {
      const start = [...STUDIO_WIDGET_ORDER];
      expect(reflowAssignment(start, "agenda", 2)).toBe(start);
    });

    it("returns the same reference for an unknown id", () => {
      const start = [...STUDIO_WIDGET_ORDER];
      expect(reflowAssignment(start, "nope" as StudioWidgetId, 0)).toBe(start);
    });
  });

  describe("moveWidgetToZone", () => {
    it("commits the reflowed assignment", () => {
      moveWidgetToZone("tasks", 2);
      expect(getZoneAssignment()).toEqual([
        "captures",
        "agenda",
        "tasks",
        "habits",
        "journal",
        "projects",
        "areas",
        "people",
      ]);
    });

    it("notifies on a real move and is a no-op emit-wise for a same-zone move", () => {
      let calls = 0;
      const unsub = subscribeZoneAssignment(() => {
        calls += 1;
      });

      moveWidgetToZone("tasks", 2); // 0 → 2: real move → notify
      moveWidgetToZone("tasks", 2); // already at 2 → no-op
      moveWidgetToZone("agenda", 99); // real move (clamped) → notify

      unsub();
      moveWidgetToZone("captures", 3); // after unsub → no notify

      expect(calls).toBe(2);
    });

    it("keeps a stable assignment reference until a real move", () => {
      const a = getZoneAssignment();
      expect(getZoneAssignment()).toBe(a); // unchanged → same ref

      moveWidgetToZone("tasks", 2); // real move
      const b = getZoneAssignment();
      expect(b).not.toBe(a);

      moveWidgetToZone("tasks", 2); // no-op (already at 2)
      expect(getZoneAssignment()).toBe(b); // still stable
    });
  });

  describe("setDndState", () => {
    it("updates the transient drag state", () => {
      setDndState("tasks", 3);
      expect(getDndState()).toEqual({ grabbedId: "tasks", nearestZone: 3 });
    });

    it("only emits when the drag state actually changes", () => {
      let calls = 0;
      const unsub = subscribeDndState(() => {
        calls += 1;
      });

      setDndState("tasks", 3); // idle → grab → notify
      setDndState("tasks", 3); // identical → no-op
      setDndState("tasks", 4); // zone flip → notify
      setDndState(null, null); // release → idle → notify
      setDndState(null, null); // already idle → no-op

      unsub();
      setDndState("captures", 1); // after unsub → no notify

      expect(calls).toBe(3);
    });

    it("collapses back to a stable idle reference on release", () => {
      const idle = getDndState();
      setDndState("tasks", 3);
      setDndState(null, null);
      expect(getDndState()).toBe(idle); // same frozen idle ref
    });

    it("keeps a stable drag snapshot until it changes", () => {
      setDndState("tasks", 3);
      const s = getDndState();
      expect(getDndState()).toBe(s); // unchanged → same ref

      setDndState("tasks", 4);
      expect(getDndState()).not.toBe(s);
    });
  });

  it("keeps the assignment and drag channels independent", () => {
    let assignCalls = 0;
    let dndCalls = 0;
    const unsubA = subscribeZoneAssignment(() => {
      assignCalls += 1;
    });
    const unsubD = subscribeDndState(() => {
      dndCalls += 1;
    });

    setDndState("tasks", 3); // drag channel only
    setDndState("tasks", 4);
    expect(assignCalls).toBe(0);
    expect(dndCalls).toBe(2);

    moveWidgetToZone("tasks", 2); // assignment channel only
    expect(assignCalls).toBe(1);
    expect(dndCalls).toBe(2);

    unsubA();
    unsubD();
  });
});
