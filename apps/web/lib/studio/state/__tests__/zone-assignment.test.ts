import { beforeEach, describe, expect, it } from "vitest";

import {
  STUDIO_WIDGET_ORDER,
  type StudioWidgetId,
} from "@/components/studio/data/useStudioData";
import {
  __resetZoneAssignment,
  getDndState,
  getZoneAssignment,
  insertWidgetAtZone,
  insertWidgetIntoAssignment,
  moveWidgetToZone,
  reflowAssignment,
  removeWidget,
  removeWidgetFromAssignment,
  replaceAssignment,
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

  describe("removeWidgetFromAssignment (pure)", () => {
    it("drops the id and closes the gap", () => {
      const next = removeWidgetFromAssignment([...STUDIO_WIDGET_ORDER], "agenda");
      expect(next).toEqual([
        "tasks",
        "captures",
        "habits",
        "journal",
        "projects",
        "areas",
        "people",
      ]);
      expect(next).toHaveLength(STUDIO_WIDGET_ORDER.length - 1);
    });

    it("returns the same reference for an absent id", () => {
      const start = [...STUDIO_WIDGET_ORDER];
      expect(removeWidgetFromAssignment(start, "nope" as StudioWidgetId)).toBe(start);
    });
  });

  describe("insertWidgetIntoAssignment (pure)", () => {
    it("splices the id in at the target zone", () => {
      const base: StudioWidgetId[] = ["tasks", "captures", "agenda"];
      expect(insertWidgetIntoAssignment(base, "habits", 0)).toEqual([
        "habits",
        "tasks",
        "captures",
        "agenda",
      ]);
    });

    it("clamps an out-of-range zone to the end (append)", () => {
      const base: StudioWidgetId[] = ["tasks", "captures"];
      expect(insertWidgetIntoAssignment(base, "habits", 99)).toEqual([
        "tasks",
        "captures",
        "habits",
      ]);
    });

    it("returns the same reference when the id is already present", () => {
      const base: StudioWidgetId[] = ["tasks", "captures"];
      expect(insertWidgetIntoAssignment(base, "tasks", 0)).toBe(base);
    });
  });

  describe("removeWidget / insertWidgetAtZone (store writers)", () => {
    it("removeWidget drops the id and emits once, then no-ops when absent", () => {
      let calls = 0;
      const unsub = subscribeZoneAssignment(() => {
        calls += 1;
      });

      removeWidget("tasks"); // present → emit
      removeWidget("tasks"); // now absent → no-op

      expect(getZoneAssignment()).not.toContain("tasks");
      expect(calls).toBe(1);
      unsub();
    });

    it("insertWidgetAtZone appends and is idempotent for an owned id", () => {
      replaceAssignment(["tasks", "captures"]);
      insertWidgetAtZone("habits", 2); // append
      expect(getZoneAssignment()).toEqual(["tasks", "captures", "habits"]);

      const before = getZoneAssignment();
      insertWidgetAtZone("habits", 0); // already owned → no-op, stable ref
      expect(getZoneAssignment()).toBe(before);
    });

    it("insertWidgetAtZone(0) lands at the leftmost slot", () => {
      replaceAssignment(["tasks", "captures"]);
      insertWidgetAtZone("habits", 0);
      expect(getZoneAssignment()).toEqual(["habits", "tasks", "captures"]);
    });
  });

  describe("replaceAssignment (store writer)", () => {
    it("replaces the owned set and emits", () => {
      let calls = 0;
      const unsub = subscribeZoneAssignment(() => {
        calls += 1;
      });

      replaceAssignment([]); // relinquish
      expect(getZoneAssignment()).toEqual([]);
      replaceAssignment(["tasks"]); // adopt one
      expect(getZoneAssignment()).toEqual(["tasks"]);

      expect(calls).toBe(2);
      unsub();
    });

    it("is a stable-reference no-op for a shallow-equal replace", () => {
      moveWidgetToZone("tasks", 0); // ensure a known state
      const before = getZoneAssignment();
      replaceAssignment([...STUDIO_WIDGET_ORDER]); // shallow-equal to initial
      expect(getZoneAssignment()).toBe(before);
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
