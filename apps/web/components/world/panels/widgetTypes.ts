import type { Vector3Tuple } from "three";
import type { CameraPose } from "../data/diffing";

/**
 * THE BOTTEGA (Phase 3) — shared type surface, frozen by the Conductor at Wave W1
 * open so the four parallel W1 units stay genuinely file-disjoint (no intra-wave
 * type race). `WidgetId` and the bench-geometry types live here; W-01 (focusStack
 * widget level), W-02 (solver/registry/bus), and W-03 (WorldPanel primitive) all
 * import from this module rather than re-declaring them.
 *
 * Deviation note vs PHASE-3-PLAN §3.3/§3.4: the plan colocated `WidgetId` in
 * WorldPanel.tsx and `BenchConfig`/`BenchSlot` in widgetLayout.ts. Hoisting just
 * these three shared types into this tiny, dependency-light module removes the
 * only cross-file coupling inside Wave W1. No behavior changes; the units own
 * every other type exactly as specced.
 */

/** The bench roster. Grows additively per new widget unit (orchestrator amendment). */
export type WidgetId = "tasks" | "captures" | "agenda" | "habits" | "journal";

/** Bench arc geometry (PHASE-3-PLAN §3.4). Defaults are tunable constants, not law. */
export interface BenchConfig {
  center: Vector3Tuple; // arc center ≈ the standing point; default [0, 0, 4.6]
  eyeY: number; // panel center height; default 1.5 (TodayPanel precedent)
  radius: number; // slot distance from center; default 3.0
  aisleRad: number; // central gap toward the Tree; default 70° in radians
  maxSlots: number; // 7 — the hard live-panel cap (§7.2)
}

/** One solved bench slot: where a panel stands and the pose that reads it. */
export interface BenchSlot {
  index: number; // 0 = leftmost
  widgetId: WidgetId;
  position: Vector3Tuple; // panel group transform (world space)
  rotation: Vector3Tuple; // faces the arc center
  cameraPose: CameraPose; // reading pose: at center, facing the slot, ~1.9 m
}
