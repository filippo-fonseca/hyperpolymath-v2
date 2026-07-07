import { describe, it, expect } from "vitest";
import type { WidgetId } from "../widgetTypes";
import {
  solveBenchLayout,
  slotAngles,
  lodCenterIndex,
  lodForSlot,
  LOD_FULL_RADIUS,
  DEFAULT_BENCH_CONFIG,
} from "../widgetLayout";
import { DEFAULT_LAYOUT } from "../widgetLayoutStore";

/**
 * benchPerf.test.ts — W-15 · The Studiolo · The Bottega (Phase 3) · perf-hardening
 *
 * The AUTOMATABLE half of the §7 perf gate: the pure, browser-free invariants
 * that GUARD the §7.2 draw-call budget. The live GPU numbers (fps, drag-thrash,
 * uikit re-layout ms, `gl.info.render.calls`) require Filippo's authenticated
 * in-browser `/world` session and are a HUMAN GATE — recorded in
 * `components/world/__tests__/perf.md`, never faked here. What CAN be proven
 * statically, and is proven below:
 *
 *   1. `solveBenchLayout` never emits more than `maxSlots` (=7) live slots — the
 *      hard live-panel cap that stops the arc from ever exceeding its budget.
 *   2. The LOD selector (`lodForSlot`, radius `LOD_FULL_RADIUS`) yields AT MOST 3
 *      "full" panels for ANY focus/order — the load-bearing draw-call invariant
 *      (§7.2 "at most 3 panels render full content").
 *   3. `DEFAULT_LAYOUT` fits the bench: its order is the 5-widget roster, within
 *      the slot cap, nothing hidden.
 *   4. A code-derived (NOT measured) draw-call MODEL, built from the per-surface
 *      counts asserted in `WorldPanel.tsx` / `FocusedPanelGlass.tsx`, stays under
 *      the §7.2 bench-layer ceiling (≤90) and scene ceiling (≤190) for every
 *      reachable bench configuration.
 *
 * These are static-accounting ceilings derived from source constants, clearly
 * labelled as such — not GPU measurements. The measured numbers live in perf.md.
 */

const ROSTER: WidgetId[] = ["tasks", "captures", "agenda", "habits", "journal"];
const MAX_SLOTS = DEFAULT_BENCH_CONFIG.maxSlots; // 7 (§7.2 live-widget cap)

/** Every id repeated enough to build over-long orders for the clamp tests. */
function repeated(len: number): WidgetId[] {
  const out: WidgetId[] = [];
  for (let i = 0; i < len; i++) out.push(ROSTER[i % ROSTER.length]!);
  return out;
}

// ── 1. solveBenchLayout never exceeds maxSlots ───────────────────────────────
describe("solveBenchLayout — never exceeds the live-slot cap (§7.2)", () => {
  it("emits exactly min(order.length, maxSlots) slots for any order length 0..20", () => {
    for (let len = 0; len <= 20; len++) {
      const slots = solveBenchLayout(repeated(len));
      expect(slots.length).toBe(Math.min(len, MAX_SLOTS));
      expect(slots.length).toBeLessThanOrEqual(MAX_SLOTS);
    }
  });

  it("honours a tighter custom maxSlots and still never over-emits", () => {
    for (const cap of [1, 2, 3, 5]) {
      const slots = solveBenchLayout(repeated(20), { maxSlots: cap });
      expect(slots.length).toBe(cap);
      expect(slots.length).toBeLessThanOrEqual(cap);
    }
  });

  it("re-indexes slots 0..n-1 contiguously (no gaps that could double-mount)", () => {
    const slots = solveBenchLayout(repeated(12)); // clamps to 7
    slots.forEach((s, i) => expect(s.index).toBe(i));
  });
});

// ── 2. The LOD selector yields ≤3 "full" for any focus/order ─────────────────
describe("LOD selector — at most 3 full panels for any focus/order (§7.2)", () => {
  /** Count "full" LOD panels for an n-slot bench focused at `focusIndex` (<0 = vestibule). */
  function fullCount(n: number, focusIndex: number): number {
    const center = lodCenterIndex(n, focusIndex);
    let full = 0;
    for (let i = 0; i < n; i++) {
      if (lodForSlot(i, center) === "full") full++;
    }
    return full;
  }

  it("radius is 1 (focused panel + its two arc neighbours)", () => {
    expect(LOD_FULL_RADIUS).toBe(1);
  });

  it("never exceeds 3 full for every bench size 0..maxSlots and every focus (incl. vestibule)", () => {
    for (let n = 0; n <= MAX_SLOTS; n++) {
      // Vestibule (nothing focused) → centred on the arc middle.
      expect(fullCount(n, -1)).toBeLessThanOrEqual(3);
      // Every possible focused slot.
      for (let focus = 0; focus < n; focus++) {
        expect(fullCount(n, focus)).toBeLessThanOrEqual(3);
      }
    }
  });

  it("the full window is exactly [center-1, center+1] ∩ [0,n) — contiguous, ≤3", () => {
    for (let n = 1; n <= MAX_SLOTS; n++) {
      for (let focus = -1; focus < n; focus++) {
        const center = lodCenterIndex(n, focus);
        const fullIdx: number[] = [];
        for (let i = 0; i < n; i++) {
          if (lodForSlot(i, center) === "full") fullIdx.push(i);
        }
        // Contiguous run.
        for (let k = 1; k < fullIdx.length; k++) {
          expect(fullIdx[k]! - fullIdx[k - 1]!).toBe(1);
        }
        // Bounded by the window around the resolved centre.
        for (const i of fullIdx) {
          expect(Math.abs(i - center)).toBeLessThanOrEqual(LOD_FULL_RADIUS);
        }
        expect(fullIdx.length).toBeLessThanOrEqual(3);
      }
    }
  });

  it("the default 5-widget vestibule bench renders the central trio full, wings as placards", () => {
    const slots = solveBenchLayout(DEFAULT_LAYOUT.order); // n = 5
    const center = lodCenterIndex(slots.length, -1); // floor(5/2) = 2
    const lods = slots.map((s) => lodForSlot(s.index, center));
    expect(lods).toEqual([
      "placard", // 0
      "full", // 1
      "full", // 2 (centre)
      "full", // 3
      "placard", // 4
    ]);
    expect(lods.filter((l) => l === "full")).toHaveLength(3);
  });
});

// ── 3. DEFAULT_LAYOUT fits the bench ─────────────────────────────────────────
describe("DEFAULT_LAYOUT — fits within the bench budget", () => {
  it("is the full 5-widget roster, in order, nothing hidden", () => {
    expect(DEFAULT_LAYOUT.order).toEqual(ROSTER);
    expect(DEFAULT_LAYOUT.hidden).toEqual([]);
  });

  it("length is within the live-slot cap so every default widget gets a real slot", () => {
    expect(DEFAULT_LAYOUT.order.length).toBeLessThanOrEqual(MAX_SLOTS);
    const slots = solveBenchLayout(DEFAULT_LAYOUT.order);
    expect(slots.length).toBe(DEFAULT_LAYOUT.order.length); // none clamped away
  });

  it("slot angles are unique (no two default widgets collide on the arc)", () => {
    const angles = slotAngles(DEFAULT_LAYOUT.order);
    const set = new Set(angles);
    expect(set.size).toBe(angles.length);
  });
});

// ── 4. Static draw-call MODEL vs the §7.2 ceilings (code-derived, not measured) ─
//
// Per-surface draw-call counts, taken verbatim from the source they describe —
// this is STATIC accounting of the code as-built, NOT a GPU measurement (the live
// `gl.info.render.calls` reading is the human gate in perf.md):
//   • FULL panel  ≤ 22 calls  — WorldPanel.tsx:54 ("uikit <Root> batches ≤21 + frame 1").
//   • PLACARD      = 2 calls   — WorldPanel.tsx:52 ("frame 1 + one SDF Text 1 = 2 here"),
//                                budget ≤4.
//   • BACKPLATE    = 1 call    — FocusedPanelGlass.tsx: ONE RoundedBox mounted only when
//                                focus.kind === "widget" (+1 transmission scene pass, tracked
//                                separately, not a base draw call).
// §7.2 ceilings: bench layer ≤ 90; new scene ≤ 190 (bench + Phase-1 base, meridian retired).
describe("draw-call model — under the §7.2 ceilings for every reachable bench", () => {
  const FULL_PANEL_MAX_CALLS = 22; // WorldPanel.tsx:54
  const PLACARD_CALLS = 2; // WorldPanel.tsx:52 (frame + SDF title)
  const BACKPLATE_CALLS = 1; // FocusedPanelGlass.tsx (one hero RoundedBox)
  const BENCH_LAYER_CEILING = 90; // §7.2
  const SCENE_CEILING = 190; // §7.2
  // Phase-1 loaded-Vestibule static tally upper bound (perf.md §2: "≈ 40–55").
  const PHASE1_BASE_UPPER = 55;

  /** Modelled bench-layer draw calls for an n-slot bench focused at `focusIndex`. */
  function benchLayerCalls(n: number, focusIndex: number): number {
    const center = lodCenterIndex(n, focusIndex);
    let full = 0;
    let placard = 0;
    for (let i = 0; i < n; i++) {
      if (lodForSlot(i, center) === "full") full++;
      else placard++;
    }
    const backplate = focusIndex >= 0 ? BACKPLATE_CALLS : 0; // hero only when focused
    return full * FULL_PANEL_MAX_CALLS + placard * PLACARD_CALLS + backplate;
  }

  it("bench layer stays ≤ 90 for every bench size and focus (incl. vestibule)", () => {
    for (let n = 0; n <= MAX_SLOTS; n++) {
      expect(benchLayerCalls(n, -1)).toBeLessThanOrEqual(BENCH_LAYER_CEILING);
      for (let focus = 0; focus < n; focus++) {
        expect(benchLayerCalls(n, focus)).toBeLessThanOrEqual(BENCH_LAYER_CEILING);
      }
    }
  });

  it("worst case (full 7-widget arc, one focused) is within budget with headroom", () => {
    // 3 full × 22 = 66, 4 placards × 2 = 8, 1 backplate = 75 ≤ 90.
    const worst = benchLayerCalls(MAX_SLOTS, 3);
    expect(worst).toBe(75);
    expect(worst).toBeLessThanOrEqual(BENCH_LAYER_CEILING);
  });

  it("the §7.4 five-widget seed sits far under the ceiling (vestibule & focused)", () => {
    const n = DEFAULT_LAYOUT.order.length; // 5
    const vestibule = benchLayerCalls(n, -1); // 3 full + 2 placard, no backplate
    const focused = benchLayerCalls(n, 2); // 3 full + 2 placard + backplate
    expect(vestibule).toBe(70);
    expect(focused).toBe(71);
    expect(focused).toBeLessThanOrEqual(BENCH_LAYER_CEILING);
  });

  it("bench + Phase-1 base scene stays under the ≤190 scene ceiling", () => {
    for (let n = 0; n <= MAX_SLOTS; n++) {
      for (let focus = -1; focus < n; focus++) {
        const scene = benchLayerCalls(n, focus) + PHASE1_BASE_UPPER;
        expect(scene).toBeLessThanOrEqual(SCENE_CEILING);
      }
    }
  });
});
