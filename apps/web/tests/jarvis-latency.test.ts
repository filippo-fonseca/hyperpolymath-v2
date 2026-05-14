/**
 * JARVIS-15 latency telemetry helper — Phase 5 Plan 05-04 Task 3.
 *
 * Unit-tests the percentile math and the Drizzle-select chain shape.
 * Real `jarvis_events` reads happen at the Task 4 smoke checkpoint with the
 * dev server running.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { dbState } = vi.hoisted(() => ({
  dbState: {
    selectReturns: [] as Array<{
      firstTokenMs: number | null;
      latencyMs: number | null;
    }>,
  },
}));

vi.mock("@/lib/db", () => {
  function makeSelectChain() {
    const chain: Record<string, unknown> = {};
    chain.from = vi.fn().mockReturnValue(chain);
    chain.where = vi.fn().mockResolvedValue(dbState.selectReturns);
    return chain;
  }
  return {
    db: {
      select: vi.fn(() => makeSelectChain()),
    },
  };
});

// Drizzle helpers — re-exported as no-op factories so the helper's import
// chain resolves under vi.mock("@/lib/db").
vi.mock("drizzle-orm", async () => {
  const actual = await vi.importActual<Record<string, unknown>>("drizzle-orm");
  return {
    ...actual,
    and: (...args: unknown[]) => ({ kind: "and", args }),
    eq: (a: unknown, b: unknown) => ({ kind: "eq", a, b }),
    gt: (a: unknown, b: unknown) => ({ kind: "gt", a, b }),
    isNotNull: (a: unknown) => ({ kind: "isNotNull", a }),
  };
});

import { getLatencyStats, percentile } from "@/lib/jarvis/latency-check";

beforeEach(() => {
  dbState.selectReturns = [];
});

describe("percentile (discrete)", () => {
  it("returns 0 on empty input", () => {
    expect(percentile([], 0.5)).toBe(0);
    expect(percentile([], 0.95)).toBe(0);
  });

  it("p50 of [1,2,3,4,5] returns the 3rd value (3)", () => {
    expect(percentile([1, 2, 3, 4, 5], 0.5)).toBe(3);
  });

  it("p95 of [1,2,3,4,5,6,7,8,9,10] returns the 10th value (10)", () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.95)).toBe(10);
  });

  it("p95 of 20 evenly-distributed values returns the 19th value", () => {
    const xs = Array.from({ length: 20 }, (_, i) => (i + 1) * 100);
    // ceil(20 * 0.95) - 1 = 18 → xs[18] = 1900
    expect(percentile(xs, 0.95)).toBe(1900);
  });

  it("p100 returns last value, p0 returns first", () => {
    expect(percentile([1, 2, 3], 1)).toBe(3);
    expect(percentile([1, 2, 3], 0)).toBe(1);
  });

  it("clamps to valid range when p is out of bounds", () => {
    // Negative p is treated as 0
    expect(percentile([10, 20, 30], -1)).toBe(10);
    // p > 1 is treated as 1
    expect(percentile([10, 20, 30], 2)).toBe(30);
  });
});

describe("getLatencyStats (mocked DB)", () => {
  it("returns zeros when there are no rows", async () => {
    dbState.selectReturns = [];
    const stats = await getLatencyStats("user-a", 30);
    expect(stats.count).toBe(0);
    expect(stats.first_token_p50).toBe(0);
    expect(stats.first_token_p95).toBe(0);
    expect(stats.latency_p50).toBe(0);
    expect(stats.latency_p95).toBe(0);
  });

  it("computes p50 + p95 across mixed warm/cold first_token_ms", async () => {
    // 10 rows: 9 warm (~3-4s) + 1 cold (68s, simulating Plan 05-02's smoke evidence)
    dbState.selectReturns = [
      { firstTokenMs: 3000, latencyMs: 4000 },
      { firstTokenMs: 3200, latencyMs: 4500 },
      { firstTokenMs: 3500, latencyMs: 5000 },
      { firstTokenMs: 3700, latencyMs: 4800 },
      { firstTokenMs: 3800, latencyMs: 5100 },
      { firstTokenMs: 4000, latencyMs: 5500 },
      { firstTokenMs: 4200, latencyMs: 6000 },
      { firstTokenMs: 4500, latencyMs: 6500 },
      { firstTokenMs: 5000, latencyMs: 7000 },
      { firstTokenMs: 68000, latencyMs: 72000 },
    ];
    const stats = await getLatencyStats("user-a", 30);
    expect(stats.count).toBe(10);
    // p50 first_token = 5th value (ceil(10*0.5)-1 = 4) = 3800
    expect(stats.first_token_p50).toBe(3800);
    // p95 first_token = 10th value (ceil(10*0.95)-1 = 9) = 68000
    expect(stats.first_token_p95).toBe(68000);
    expect(stats.latency_p50).toBe(5100);
    expect(stats.latency_p95).toBe(72000);
  });

  it("filters out rows with first_token_ms NULL (zero-valued)", async () => {
    // Some rows have firstTokenMs=null (error before first token). The helper
    // already filters isNotNull at the SQL layer, but defensively the TS
    // percentile filters > 0 so any zero-valued slipthroughs don't distort.
    dbState.selectReturns = [
      { firstTokenMs: 3000, latencyMs: 4000 },
      { firstTokenMs: null, latencyMs: 0 },
      { firstTokenMs: 4000, latencyMs: 5000 },
    ];
    const stats = await getLatencyStats("user-a", 30);
    // count returns rows.length (raw) — DB query already returns only non-null
    // rows in production; here the mock can return null entries.
    // After filtering, percentile sees [3000, 4000].
    // p50 of [3000, 4000] = idx ceil(2*0.5)-1 = 0 → 3000
    expect(stats.first_token_p50).toBe(3000);
  });
});
