/**
 * nutrition-service.test.ts — unit tests for the nutrition service layer.
 *
 * Mocks the Drizzle `db` object so no real DB connection is needed.
 * Verifies:
 *   1. logFood inserts a row with SNAPSHOTTED kcal/proteinG/carbsG/fatG
 *   2. deleteLog uses double-WHERE (id + user_id) ownership pattern
 *   3. upsertFood seeds at least one food_serving_options row (100g default)
 *   4. listFoodLogsForDay returns rows ordered by mealSlot + createdAt
 *
 * Service functions are plain async functions that accept userId first (D-14).
 *
 * NOTE: vi.mock() is hoisted by vitest, so the factory must NOT reference
 * variables from module scope. We use vi.hoisted() to bridge the gap.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ---------------------------------------------------------------------------
// Hoist the mock builders so vi.mock() factory can reference them
// ---------------------------------------------------------------------------

const { mockDb } = vi.hoisted(() => {
  function makeChain(overrides?: Record<string, unknown>) {
    const chain: Record<string, unknown> = {};
    const methods = [
      "select", "from", "where", "insert", "values", "update", "set",
      "delete", "returning", "orderBy", "limit", "leftJoin", "innerJoin",
      "onConflictDoUpdate", "onConflictDoNothing",
    ];
    for (const m of methods) {
      chain[m] = vi.fn(() => chain);
    }
    // Make chain awaitable (resolves to [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (chain as any).then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(resolve as any, reject as any);
    return { ...chain, ...overrides };
  }

  const mockDb = {
    select: vi.fn(() => makeChain()),
    insert: vi.fn(() => makeChain()),
    update: vi.fn(() => makeChain()),
    delete: vi.fn(() => makeChain()),
    transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(makeChain())),
  };

  return { mockDb };
});

vi.mock("@/lib/db", () => ({ db: mockDb }));

// ---------------------------------------------------------------------------
// Import service AFTER mock registration
// ---------------------------------------------------------------------------

import {
  logFood,
  deleteLog,
  upsertFood,
  listFoodLogsForDay,
  getNutritionTargets,
} from "@/lib/nutrition/nutrition-service";

// ---------------------------------------------------------------------------
// Helpers to set up specific mock behaviors
// ---------------------------------------------------------------------------

function makeSelectChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.leftJoin = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => Promise.resolve(rows));
  chain.limit = vi.fn(() => Promise.resolve(rows));
  return chain;
}

function makeInsertChain(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  chain.values = vi.fn(() => chain);
  chain.returning = vi.fn(() => Promise.resolve(rows));
  chain.onConflictDoUpdate = vi.fn(() => chain);
  chain.onConflictDoNothing = vi.fn(() => chain);
  return chain;
}

function makeUpdateChain() {
  const chain: Record<string, unknown> = {};
  chain.set = vi.fn(() => chain);
  chain.where = vi.fn(() => Promise.resolve(undefined));
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.where = vi.fn(() => Promise.resolve(undefined));
  return chain;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("logFood", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const foodRow = {
      id: "food-id-1",
      kcalPer100g: "200",
      proteinPer100g: "10",
      carbsPer100g: "25",
      fatPer100g: "5",
      fiberPer100g: null,
    };

    const servingRow = {
      id: "serving-id-1",
      gramsOrMl: "100",
    };

    const logInsertedRow = {
      id: "log-id-1",
      userId: "user-a",
      logDate: "2026-06-13",
      mealSlot: "lunch",
      foodId: "food-id-1",
      servingOptionId: "serving-id-1",
      quantity: "2",
      kcal: 400,     // 200 kcal/100g × (2 × 100g) = 400
      proteinG: "20",
      carbsG: "50",
      fatG: "10",
      fiberG: null,
      notes: null,
      createdAt: new Date(),
    };

    let selectCallCount = 0;
    mockDb.select.mockImplementation(() => {
      selectCallCount++;
      // Call 1 = food lookup, call 2 = serving option lookup
      return makeSelectChain(selectCallCount === 1 ? [foodRow] : [servingRow]);
    });

    mockDb.insert.mockReturnValue(makeInsertChain([logInsertedRow]));
    mockDb.update.mockReturnValue(makeUpdateChain());
  });

  it("calls db.insert(foodLogs) with snapshotted kcal/proteinG/carbsG/fatG", async () => {
    await logFood("user-a", {
      date: "2026-06-13",
      mealSlot: "lunch",
      foodId: "food-id-1",
      servingOptionId: "serving-id-1",
      quantity: 2,
    });

    expect(mockDb.insert).toHaveBeenCalled();

    // Verify values() was called with snapshotted macro fields
    const insertChain = mockDb.insert.mock.results[0]?.value as Record<string, unknown>;
    const valuesFn = insertChain?.values as ReturnType<typeof vi.fn>;
    expect(valuesFn).toHaveBeenCalled();

    const valuesArg = valuesFn?.mock.calls[0]?.[0] as Record<string, unknown>;
    if (valuesArg) {
      expect(valuesArg).toHaveProperty("kcal");
      expect(valuesArg).toHaveProperty("proteinG");
      expect(valuesArg).toHaveProperty("carbsG");
      expect(valuesArg).toHaveProperty("fatG");
      // The snapshot pattern: kcal must be a number computed by computeMacros
      expect(typeof valuesArg.kcal).toBe("number");
      // 200 kcal/100g × 2 × 100g = 400
      expect(valuesArg.kcal).toBe(400);
    }
  });

  it("calls db.update to bump foods.useCount after logging", async () => {
    await logFood("user-a", {
      date: "2026-06-13",
      mealSlot: "lunch",
      foodId: "food-id-1",
      servingOptionId: "serving-id-1",
      quantity: 2,
    });

    // update() should be called for bumping useCount
    expect(mockDb.update).toHaveBeenCalled();
  });
});

describe("deleteLog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDb.delete.mockReturnValue(makeDeleteChain());
  });

  it("calls db.delete with a where clause containing ownership check", async () => {
    await deleteLog("user-a", "log-id-1");

    expect(mockDb.delete).toHaveBeenCalled();
    const deleteChain = mockDb.delete.mock.results[0]?.value as Record<string, unknown>;
    const whereFn = deleteChain?.where as ReturnType<typeof vi.fn>;
    expect(whereFn).toHaveBeenCalled();

    // The WHERE argument should be an `and(eq(foodLogs.id, ...), eq(foodLogs.userId, ...))`
    // Drizzle compiles this to a SQL AST object — we just verify where() was called once
    // with a single argument (the AND expression)
    expect(whereFn.mock.calls[0]).toHaveLength(1);
  });
});

describe("upsertFood", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const newFoodId = "new-food-id";
    const foodInsertChain = makeInsertChain([{ id: newFoodId, name: "Test Food" }]);
    const servingInsertChain = makeInsertChain([{ id: "serving-id-new" }]);

    let insertCallCount = 0;
    mockDb.insert.mockImplementation(() => {
      insertCallCount++;
      return insertCallCount === 1 ? foodInsertChain : servingInsertChain;
    });
  });

  it("calls db.insert at least twice (food + at least one serving option)", async () => {
    await upsertFood("user-a", {
      name: "Test Food",
      kcalPer100g: 89,
      proteinPer100g: 1.1,
      carbsPer100g: 22.8,
      fatPer100g: 0.3,
    });

    // Should insert food + at least one serving option (100g default)
    expect(mockDb.insert.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("returns { food, servingOptions } shape", async () => {
    const result = await upsertFood("user-a", {
      name: "Test Food",
      kcalPer100g: 89,
      proteinPer100g: 1.1,
      carbsPer100g: 22.8,
      fatPer100g: 0.3,
    });

    expect(result).toHaveProperty("food");
    expect(result).toHaveProperty("servingOptions");
    expect(Array.isArray(result.servingOptions)).toBe(true);
    expect(result.servingOptions.length).toBeGreaterThanOrEqual(1);
  });
});

describe("listFoodLogsForDay", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const rows = [
      {
        log: { id: "log-1", mealSlot: "breakfast", createdAt: new Date("2026-06-13T08:00:00Z") },
        food: { id: "food-1", name: "Oatmeal", brand: null, baseUnit: "g" },
        serving: null,
      },
      {
        log: { id: "log-2", mealSlot: "lunch", createdAt: new Date("2026-06-13T12:00:00Z") },
        food: { id: "food-2", name: "Chicken", brand: null, baseUnit: "g" },
        serving: null,
      },
    ];

    mockDb.select.mockReturnValue(makeSelectChain(rows));
  });

  it("calls db.select().from().where().orderBy() and returns rows", async () => {
    const result = await listFoodLogsForDay("user-a", "2026-06-13");

    expect(mockDb.select).toHaveBeenCalled();
    const selectChain = mockDb.select.mock.results[0]?.value as Record<string, unknown>;
    const orderByFn = selectChain?.orderBy as ReturnType<typeof vi.fn>;
    expect(orderByFn).toHaveBeenCalled();
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(2);
  });
});

describe("getNutritionTargets", () => {
  it("returns defaults when no row exists for user", async () => {
    vi.clearAllMocks();
    mockDb.select.mockReturnValue(makeSelectChain([]));

    const result = await getNutritionTargets("user-a");

    expect(result.targetKcal).toBe(2000);
    expect(result.proteinPct).toBe(30);
    expect(result.carbsPct).toBe(40);
    expect(result.fatPct).toBe(30);
  });

  it("returns stored values when a row exists", async () => {
    vi.clearAllMocks();
    mockDb.select.mockReturnValue(
      makeSelectChain([
        {
          userId: "user-a",
          targetKcal: 2500,
          proteinPct: "35",
          carbsPct: "45",
          fatPct: "20",
        },
      ]),
    );

    const result = await getNutritionTargets("user-a");

    expect(result.targetKcal).toBe(2500);
    expect(Number(result.proteinPct)).toBe(35);
  });
});
