import { describe, it, expect } from "vitest";
import {
  classifyTask,
  hasFilament,
  filamentScaleY,
  buildEmberSlots,
  type EmberState,
} from "../mappings";
import { solveTreeLayout } from "../treeLayout";
import { mkTask, mkArea, mkProject } from "./_fixtures";

const TODAY = "2026-07-06";

describe("classifyTask — truth table (today = 2026-07-06)", () => {
  const cases: Array<{
    n: number;
    status: TaskWithProjectsStatus;
    dueDate: string | null;
    priority: TaskWithProjectsPriority;
    expect: EmberState;
  }> = [
    { n: 1, status: "in progress", dueDate: "2026-07-06", priority: "P3", expect: "today" },
    { n: 2, status: "not started", dueDate: "2026-07-05", priority: "P3", expect: "overdue" },
    { n: 3, status: "not started", dueDate: "2025-12-31", priority: "P3", expect: "overdue" },
    { n: 4, status: "lesno", dueDate: "2026-07-05", priority: "P3", expect: "ascending" },
    { n: 5, status: "lesno", dueDate: null, priority: "P∞", expect: "ascending" },
    { n: 6, status: "up next", dueDate: null, priority: "P3", expect: "ambient" },
    { n: 7, status: "almost done", dueDate: "2026-07-07", priority: "P1", expect: "ambient" },
    { n: 8, status: "in progress", dueDate: "2026-07-06", priority: "P∞", expect: "today" },
    { n: 9, status: "in progress", dueDate: null, priority: "P1", expect: "ambient" },
    { n: 10, status: "in progress", dueDate: null, priority: "P2", expect: "ambient" },
    { n: 11, status: "lesno", dueDate: null, priority: "P1", expect: "ascending" },
  ];

  for (const c of cases) {
    it(`#${c.n} ${c.status}/${c.dueDate}/${c.priority} → ${c.expect}`, () => {
      const t = mkTask({ status: c.status, dueDate: c.dueDate, priority: c.priority });
      expect(classifyTask(t, TODAY)).toBe(c.expect);
    });
  }

  it("#3 cross-year overdue is lexicographic (no Date construction)", () => {
    const t = mkTask({ status: "not started", dueDate: "2025-12-31" });
    expect(classifyTask(t, TODAY)).toBe("overdue");
  });
});

describe("filament flags (priority orthogonal to state)", () => {
  it("#8 P∞ in progress → hasFilament, scaleY 2.8", () => {
    const t = mkTask({ status: "in progress", dueDate: "2026-07-06", priority: "P∞" });
    expect(hasFilament(t)).toBe(true);
    expect(filamentScaleY(t)).toBe(2.8);
  });

  it("#9 P1 in progress → hasFilament, scaleY 2.2", () => {
    const t = mkTask({ status: "in progress", dueDate: null, priority: "P1" });
    expect(hasFilament(t)).toBe(true);
    expect(filamentScaleY(t)).toBe(2.2);
  });

  it("#10 P2 → no filament", () => {
    const t = mkTask({ status: "in progress", dueDate: null, priority: "P2" });
    expect(hasFilament(t)).toBe(false);
  });

  it("#11 lesno P1 → done kills the filament", () => {
    const t = mkTask({ status: "lesno", dueDate: null, priority: "P1" });
    expect(hasFilament(t)).toBe(false);
  });
});

describe("buildEmberSlots", () => {
  const layout = solveTreeLayout([
    mkArea({ id: "a1", projects: [mkProject({ id: "p1", name: "P1" })] }),
  ]);

  it("excludes lesno rows; slot count = non-lesno count", () => {
    const tasks = [
      mkTask({ id: "t-a", projects: [{ id: "p1", name: "P1" }] }),
      mkTask({ id: "t-b", status: "lesno", projects: [{ id: "p1", name: "P1" }] }),
      mkTask({ id: "t-c" }),
    ];
    const slots = buildEmberSlots(tasks, layout, TODAY);
    expect(slots).toHaveLength(2); // t-a + t-c; t-b (lesno) excluded
    expect(slots.map((s) => s.taskId).sort()).toEqual(["t-a", "t-c"]);
  });

  it("routes a task with a known project to its lantern", () => {
    const tasks = [mkTask({ id: "t-a", projects: [{ id: "p1", name: "P1" }] })];
    const slots = buildEmberSlots(tasks, layout, TODAY);
    expect(slots[0]!.lanternId).toBe("p1");
  });

  it("falls back to trunk (lanternId null) for an unknown project id", () => {
    const tasks = [mkTask({ id: "t-x", projects: [{ id: "gone", name: "Archived" }] })];
    const slots = buildEmberSlots(tasks, layout, TODAY);
    expect(slots).toHaveLength(1);
    expect(slots[0]!.lanternId).toBeNull();
  });

  it("routes an unprojected task to the trunk cluster", () => {
    const tasks = [mkTask({ id: "t-u", projects: [] })];
    const slots = buildEmberSlots(tasks, layout, TODAY);
    expect(slots[0]!.lanternId).toBeNull();
  });

  it("stamps each slot with its classified state", () => {
    const tasks = [
      mkTask({ id: "t-today", dueDate: "2026-07-06", projects: [{ id: "p1", name: "P1" }] }),
    ];
    const slots = buildEmberSlots(tasks, layout, TODAY);
    expect(slots[0]!.state).toBe("today");
  });
});

type TaskWithProjectsStatus =
  | "not started"
  | "up next"
  | "in progress"
  | "almost done"
  | "lesno";
type TaskWithProjectsPriority = "P∞" | "P1" | "P2" | "P3";
