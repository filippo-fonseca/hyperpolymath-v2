/**
 * Fractional position-key helper (lib/pages/position.ts) — the ordering
 * backbone of the Wiki Explorer's manual drag-to-reorder. These tests are the
 * unit's correctness bar: strict-between invariants, churn under repeated
 * midpoint inserts, and randomized fuzz round-trips.
 */

import { describe, expect, it } from "vitest";
import {
  compareExplorerItems,
  initialKeysFor,
  keyBetween,
  withPinnedFirst,
} from "@/lib/pages/position";

const DIGITS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** A key is well-formed iff every char is base-62 and it never ends in '0'. */
function isWellFormed(key: string): boolean {
  if (key.length === 0) return false;
  for (const ch of key) if (!DIGITS.includes(ch)) return false;
  return key[key.length - 1] !== "0";
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("keyBetween — basic invariants", () => {
  it("produces a first key for an empty list", () => {
    const k = keyBetween(null, null);
    expect(isWellFormed(k)).toBe(true);
  });

  it("append stays strictly increasing", () => {
    let prev: string | null = null;
    let last = "";
    for (let i = 0; i < 500; i++) {
      const k = keyBetween(prev, null);
      expect(isWellFormed(k)).toBe(true);
      if (prev !== null) expect(k > last).toBe(true);
      prev = k;
      last = k;
    }
  });

  it("prepend stays strictly decreasing", () => {
    let next: string | null = null;
    for (let i = 0; i < 500; i++) {
      const k = keyBetween(null, next);
      expect(isWellFormed(k)).toBe(true);
      if (next !== null) expect(k < next).toBe(true);
      next = k;
    }
  });

  it("returns a key strictly between two neighbors", () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    const mid = keyBetween(a, b);
    expect(a < mid && mid < b).toBe(true);
    expect(isWellFormed(mid)).toBe(true);
  });

  it("throws when a >= b", () => {
    const a = keyBetween(null, null);
    const b = keyBetween(a, null);
    expect(() => keyBetween(b, a)).toThrow();
    expect(() => keyBetween(a, a)).toThrow();
  });
});

describe("keyBetween — churn: 1000 inserts between two fixed keys", () => {
  it("stays sorted under the pathological tightest-boundary pattern", () => {
    const lo = keyBetween(null, null);
    const hi = keyBetween(lo, null);
    // Always insert just above `lo`, tightening the upper bound each time — the
    // absolute worst case for a rebalance-free fractional index. Each insert
    // subdivides the same gap, so the key grows ~1 base-62 digit per ceil(log2
    // 62) ≈ 6 inserts (≈170 chars over 1000). Still sorted, still well-formed,
    // still bounded — never blows up.
    let upper = hi;
    let maxLen = Math.max(lo.length, hi.length);
    for (let i = 0; i < 1000; i++) {
      const k = keyBetween(lo, upper);
      expect(lo < k && k < upper).toBe(true);
      expect(isWellFormed(k)).toBe(true);
      maxLen = Math.max(maxLen, k.length);
      upper = k;
    }
    expect(maxLen).toBeLessThan(220);
  });

  it("keeps keys short when inserts are spread across random gaps", () => {
    const rnd = mulberry32(20260710);
    const keys = initialKeysFor(2);
    let maxLen = Math.max(keys[0].length, keys[1].length);
    for (let i = 0; i < 1000; i++) {
      const idx = 1 + Math.floor(rnd() * (keys.length - 1));
      const k = keyBetween(keys[idx - 1], keys[idx]);
      expect(keys[idx - 1] < k && k < keys[idx]).toBe(true);
      maxLen = Math.max(maxLen, k.length);
      keys.splice(idx, 0, k);
    }
    for (let i = 1; i < keys.length; i++) expect(keys[i - 1] < keys[i]).toBe(true);
    expect(maxLen).toBeLessThan(24);
  });

  it("interleaved insert-in-the-middle keeps global order", () => {
    const keys = initialKeysFor(2);
    for (let i = 0; i < 1000; i++) {
      const idx = 1 + (i % (keys.length - 1)); // some interior gap
      const k = keyBetween(keys[idx - 1], keys[idx]);
      expect(keys[idx - 1] < k && k < keys[idx]).toBe(true);
      keys.splice(idx, 0, k);
    }
    for (let i = 1; i < keys.length; i++) {
      expect(keys[i - 1] < keys[i]).toBe(true);
      expect(isWellFormed(keys[i])).toBe(true);
    }
  });
});

describe("initialKeysFor", () => {
  it("returns n strictly-increasing well-formed keys", () => {
    for (const n of [0, 1, 2, 5, 50]) {
      const keys = initialKeysFor(n);
      expect(keys).toHaveLength(n);
      for (let i = 0; i < keys.length; i++) {
        expect(isWellFormed(keys[i])).toBe(true);
        if (i > 0) expect(keys[i - 1] < keys[i]).toBe(true);
      }
    }
  });

  it("returns [] for non-positive n", () => {
    expect(initialKeysFor(0)).toEqual([]);
    expect(initialKeysFor(-3)).toEqual([]);
  });
});

describe("keyBetween — fuzz round-trip", () => {
  it("random insert sequences always keep the list sorted", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const rnd = mulberry32(seed);
      const keys = initialKeysFor(1);
      for (let i = 0; i < 400; i++) {
        // Pick a random gap: [null..k0], (ki..ki+1), or [klast..null].
        const slot = Math.floor(rnd() * (keys.length + 1));
        const a = slot === 0 ? null : keys[slot - 1];
        const b = slot === keys.length ? null : keys[slot];
        const k = keyBetween(a, b);
        if (a !== null) expect(a < k).toBe(true);
        if (b !== null) expect(k < b).toBe(true);
        expect(isWellFormed(k)).toBe(true);
        keys.splice(slot, 0, k);
      }
      // Full-list monotonicity after all inserts.
      for (let i = 1; i < keys.length; i++) {
        expect(keys[i - 1] < keys[i]).toBe(true);
      }
      // Lexicographic sort is a no-op — the list was already ordered.
      const resorted = [...keys].sort();
      expect(resorted).toEqual(keys);
    }
  });
});

describe("compareExplorerItems — (positionKey NULLS LAST, name)", () => {
  const item = (positionKey: string | null, name: string) => ({ positionKey, name });

  it("orders by position key ascending", () => {
    const a = item("A", "zebra");
    const b = item("B", "apple");
    expect(compareExplorerItems(a, b)).toBeLessThan(0);
    expect(compareExplorerItems(b, a)).toBeGreaterThan(0);
  });

  it("puts NULL keys last regardless of name", () => {
    const keyed = item("Z", "zzz");
    const nullKey = item(null, "aaa");
    expect(compareExplorerItems(keyed, nullKey)).toBeLessThan(0);
    expect(compareExplorerItems(nullKey, keyed)).toBeGreaterThan(0);
  });

  it("falls back to name when both keys are NULL", () => {
    expect(compareExplorerItems(item(null, "Apple"), item(null, "banana"))).toBeLessThan(0);
    expect(compareExplorerItems(item(null, "banana"), item(null, "carrot"))).toBeLessThan(0);
  });

  it("sorts a mixed set exactly like Postgres would", () => {
    const items = [
      item(null, "Yak"),
      item("V", "mid"),
      item(null, "Ant"),
      item("G", "low"),
    ];
    const sorted = [...items].sort(compareExplorerItems);
    expect(sorted.map((i) => i.name)).toEqual(["low", "mid", "Ant", "Yak"]);
  });
});

describe("withPinnedFirst", () => {
  it("floats pinned items above unpinned, keeping the inner order within groups", () => {
    type Row = { pinned: boolean; positionKey: string | null; name: string };
    const cmp = withPinnedFirst<Row>(compareExplorerItems);
    const rows: Row[] = [
      { pinned: false, positionKey: "A", name: "a" },
      { pinned: true, positionKey: "Z", name: "z" },
      { pinned: false, positionKey: "B", name: "b" },
      { pinned: true, positionKey: "G", name: "g" },
    ];
    const sorted = [...rows].sort(cmp);
    expect(sorted.map((r) => r.name)).toEqual(["g", "z", "a", "b"]);
  });
});
