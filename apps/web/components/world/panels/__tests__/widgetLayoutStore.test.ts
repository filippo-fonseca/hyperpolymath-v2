import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import type { WidgetId } from "../widgetTypes";
import {
  DEFAULT_LAYOUT,
  WIDGET_LAYOUT_STORAGE_KEY,
  loadWidgetLayout,
  saveWidgetLayout,
  useWidgetLayout,
  __resetWidgetLayoutStoreForTests,
  type WidgetLayoutV1,
} from "../widgetLayoutStore";

const DEFAULT_ORDER: WidgetId[] = [
  "tasks",
  "captures",
  "agenda",
  "habits",
  "journal",
];

function write(raw: string): void {
  window.localStorage.setItem(WIDGET_LAYOUT_STORAGE_KEY, raw);
}

function read(): WidgetLayoutV1 {
  return JSON.parse(
    window.localStorage.getItem(WIDGET_LAYOUT_STORAGE_KEY)!,
  ) as WidgetLayoutV1;
}

beforeEach(() => {
  window.localStorage.clear();
  __resetWidgetLayoutStoreForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DEFAULT_LAYOUT", () => {
  it("is the full roster in canonical order with nothing hidden", () => {
    expect(DEFAULT_LAYOUT.v).toBe(1);
    expect(DEFAULT_LAYOUT.order).toEqual(DEFAULT_ORDER);
    expect(DEFAULT_LAYOUT.hidden).toEqual([]);
  });

  it("is frozen so callers cannot mutate the singleton", () => {
    expect(Object.isFrozen(DEFAULT_LAYOUT)).toBe(true);
    expect(Object.isFrozen(DEFAULT_LAYOUT.order)).toBe(true);
  });

  it("hands out fresh (non-aliased) copies from loadWidgetLayout", () => {
    const a = loadWidgetLayout();
    const b = loadWidgetLayout();
    expect(a).not.toBe(b);
    expect(a.order).not.toBe(DEFAULT_LAYOUT.order);
    a.order.push("tasks"); // mutating a copy must not poison the default
    expect(DEFAULT_LAYOUT.order).toEqual(DEFAULT_ORDER);
    expect(loadWidgetLayout().order).toEqual(DEFAULT_ORDER);
  });
});

describe("round-trip", () => {
  it("save → load returns an equal layout", () => {
    const layout: WidgetLayoutV1 = {
      v: 1,
      order: ["journal", "habits", "agenda", "captures", "tasks"],
      hidden: [],
    };
    saveWidgetLayout(layout);
    expect(loadWidgetLayout()).toEqual(layout);
  });

  it("round-trips a hidden widget (dropped from order, parked in hidden)", () => {
    const layout: WidgetLayoutV1 = {
      v: 1,
      order: ["tasks", "captures", "agenda", "journal"],
      hidden: ["habits"],
    };
    saveWidgetLayout(layout);
    const loaded = loadWidgetLayout();
    expect(loaded.order).toEqual(["tasks", "captures", "agenda", "journal"]);
    expect(loaded.hidden).toEqual(["habits"]);
  });
});

describe("corruption fallback", () => {
  it("malformed JSON → DEFAULT_LAYOUT", () => {
    write("{ this is not json ]");
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("valid JSON of a non-object (null / number / string / array) → DEFAULT", () => {
    for (const raw of ["null", "42", '"nope"', "true"]) {
      write(raw);
      expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
    }
  });

  it("absent key → DEFAULT_LAYOUT", () => {
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("survives a throwing localStorage.getItem → DEFAULT", () => {
    const spy = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError");
      });
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
    spy.mockRestore();
  });

  it("saveWidgetLayout never throws when storage is unavailable", () => {
    const spy = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("QuotaExceeded");
      });
    expect(() =>
      saveWidgetLayout({ v: 1, order: [...DEFAULT_ORDER], hidden: [] }),
    ).not.toThrow();
    spy.mockRestore();
  });
});

describe("validation rules", () => {
  it("drops unknown ids", () => {
    write(
      JSON.stringify({
        v: 1,
        order: ["tasks", "ghost", "captures", "sql-inject"],
        hidden: [],
      }),
    );
    const loaded = loadWidgetLayout();
    expect(loaded.order).not.toContain("ghost" as WidgetId);
    expect(loaded.order.slice(0, 2)).toEqual(["tasks", "captures"]);
  });

  it("appends missing ids in DEFAULT order", () => {
    write(JSON.stringify({ v: 1, order: ["journal", "agenda"], hidden: [] }));
    // journal, agenda kept in their given order; the rest appended in ROSTER order
    expect(loadWidgetLayout().order).toEqual([
      "journal",
      "agenda",
      "tasks",
      "captures",
      "habits",
    ]);
  });

  it("de-duplicates repeated ids, keeping first occurrence", () => {
    write(
      JSON.stringify({
        v: 1,
        order: ["tasks", "tasks", "captures", "tasks"],
        hidden: [],
      }),
    );
    const loaded = loadWidgetLayout();
    expect(loaded.order.filter((id) => id === "tasks")).toHaveLength(1);
    expect(loaded.order).toEqual([
      "tasks",
      "captures",
      "agenda",
      "habits",
      "journal",
    ]);
  });

  it("never lets hidden overlap order (order wins)", () => {
    write(
      JSON.stringify({
        v: 1,
        order: ["tasks", "captures", "agenda", "habits", "journal"],
        hidden: ["tasks"],
      }),
    );
    const loaded = loadWidgetLayout();
    expect(loaded.hidden).toEqual([]);
    expect(loaded.order).toEqual(DEFAULT_ORDER);
  });

  it("a widget only in hidden is NOT re-appended to order", () => {
    write(
      JSON.stringify({
        v: 1,
        order: ["tasks", "captures", "agenda", "journal"],
        hidden: ["habits"],
      }),
    );
    const loaded = loadWidgetLayout();
    expect(loaded.order).not.toContain("habits" as WidgetId);
    expect(loaded.hidden).toEqual(["habits"]);
  });

  it("garbage order/hidden types → clean DEFAULT", () => {
    write(JSON.stringify({ v: 1, order: "tasks", hidden: 5 }));
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
  });
});

describe("forward-compat (future schema versions)", () => {
  it("a v:2 blob with unknown fields is salvaged best-effort to V1", () => {
    write(
      JSON.stringify({
        v: 2,
        order: ["habits", "tasks"],
        hidden: ["journal"],
        angles: { tasks: 0.5, habits: 1.2 }, // future V2 field — ignored
        theme: "midnight", // wholly unknown field — ignored
      }),
    );
    const loaded = loadWidgetLayout();
    expect(loaded.v).toBe(1); // coerced down
    expect(loaded).not.toHaveProperty("angles");
    // best-effort: given order kept first, hidden respected, rest appended
    expect(loaded.order).toEqual(["habits", "tasks", "captures", "agenda"]);
    expect(loaded.hidden).toEqual(["journal"]);
  });

  it("a v:2 blob whose ids are all unknown degrades to DEFAULT", () => {
    write(
      JSON.stringify({
        v: 2,
        slots: ["a", "b", "c"], // renamed field, unknown to V1
        order: ["nope", "gone"],
      }),
    );
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
  });
});

describe("SSR safety (no window)", () => {
  it("loadWidgetLayout returns DEFAULT when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(loadWidgetLayout()).toEqual(DEFAULT_LAYOUT);
  });

  it("saveWidgetLayout is a no-op (no throw) when window is undefined", () => {
    vi.stubGlobal("window", undefined);
    expect(() => saveWidgetLayout(DEFAULT_LAYOUT)).not.toThrow();
  });
});

describe("useWidgetLayout + moveWidget (reactive store)", () => {
  it("seeds from persisted storage on first read", () => {
    saveWidgetLayout({
      v: 1,
      order: ["journal", "habits", "agenda", "captures", "tasks"],
      hidden: [],
    });
    const { result } = renderHook(() => useWidgetLayout());
    expect(result.current.layout.order).toEqual([
      "journal",
      "habits",
      "agenda",
      "captures",
      "tasks",
    ]);
  });

  it("moveWidget reorders, persists, and re-renders with a NEW array identity", () => {
    const { result } = renderHook(() => useWidgetLayout());
    const before = result.current.layout;
    expect(before.order).toEqual(DEFAULT_ORDER);

    act(() => result.current.moveWidget("tasks", 2));

    expect(result.current.layout.order).toEqual([
      "captures",
      "agenda",
      "tasks",
      "habits",
      "journal",
    ]);
    // new identity per mutation (useFocusStack discipline)
    expect(result.current.layout).not.toBe(before);
    expect(result.current.layout.order).not.toBe(before.order);
    // persisted
    expect(read().order).toEqual([
      "captures",
      "agenda",
      "tasks",
      "habits",
      "journal",
    ]);
  });

  // moveWidget reorder truth table — order starts as DEFAULT_ORDER each case.
  const cases: Array<{
    id: WidgetId;
    to: number;
    expected: WidgetId[];
    note: string;
  }> = [
    {
      id: "tasks",
      to: 2,
      expected: ["captures", "agenda", "tasks", "habits", "journal"],
      note: "head → middle",
    },
    {
      id: "journal",
      to: 0,
      expected: ["journal", "tasks", "captures", "agenda", "habits"],
      note: "tail → head",
    },
    {
      id: "tasks",
      to: 0,
      expected: DEFAULT_ORDER,
      note: "no-op (already at index)",
    },
    {
      id: "agenda",
      to: 100,
      expected: ["tasks", "captures", "habits", "journal", "agenda"],
      note: "clamp high → last slot",
    },
    {
      id: "journal",
      to: -5,
      expected: ["journal", "tasks", "captures", "agenda", "habits"],
      note: "clamp low → first slot",
    },
    {
      id: "habits",
      to: 1,
      expected: ["tasks", "habits", "captures", "agenda", "journal"],
      note: "middle → near head",
    },
  ];

  for (const { id, to, expected, note } of cases) {
    it(`moveWidget(${id}, ${to}) → ${note}`, () => {
      const { result } = renderHook(() => useWidgetLayout());
      act(() => result.current.moveWidget(id, to));
      expect(result.current.layout.order).toEqual(expected);
    });
  }

  it("a no-op move keeps the SAME snapshot reference (no churn)", () => {
    const { result } = renderHook(() => useWidgetLayout());
    const before = result.current.layout;
    act(() => result.current.moveWidget("tasks", 0)); // already leftmost
    expect(result.current.layout).toBe(before);
  });

  it("moving an id that is not on the bench is a no-op", () => {
    saveWidgetLayout({
      v: 1,
      order: ["tasks", "captures", "agenda", "journal"],
      hidden: ["habits"],
    });
    const { result } = renderHook(() => useWidgetLayout());
    const before = result.current.layout;
    act(() => result.current.moveWidget("habits", 0));
    expect(result.current.layout).toBe(before);
    expect(result.current.layout.order).toEqual([
      "tasks",
      "captures",
      "agenda",
      "journal",
    ]);
  });

  it("clamps fractional toIndex via truncation", () => {
    const { result } = renderHook(() => useWidgetLayout());
    act(() => result.current.moveWidget("tasks", 2.9));
    // trunc(2.9) === 2 → same as moveWidget('tasks', 2)
    expect(result.current.layout.order).toEqual([
      "captures",
      "agenda",
      "tasks",
      "habits",
      "journal",
    ]);
  });
});
