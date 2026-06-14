---
phase: quick-260614-gk0
plan: 01
subsystem: graph
tags: [graph, force-directed, d3-force, ui]
requires: [react-force-graph-2d]
provides: [graph-collision-force, brighter-graph-edges]
affects: [apps/web/app/(app)/graph/GraphExplorer.tsx]
tech-stack:
  added: [d3-force@^3.0.0, "@types/d3-force@^3.0.10"]
  patterns: [imperative d3Force config on fgRef keyed on graphData/dims + d3ReheatSimulation]
key-files:
  created: []
  modified:
    - apps/web/app/(app)/graph/GraphExplorer.tsx
    - apps/web/package.json
    - pnpm-lock.yaml
decisions:
  - "Used force-graph's bundled d3-force by installing d3-force explicitly (force-graph bundles but does not re-export it)"
  - "Collision radius mirrors render radius exactly: 4·√val + 5px padding (nodeRelSize=4)"
metrics:
  duration: ~5m
  completed: 2026-06-14
---

# Quick 260614-gk0: Fix graph layout collision force for high-degree nodes Summary

Added a d3-force collision force (radius = nodeRelSize·√val + 5px), stronger charge (-110), and longer link distance (48) to the `/graph` force engine plus a post-config reheat, and brightened base relational edges (slate 0.18→0.40 @ width 0.5→1.0) so high-degree nodes like Area "Yale" no longer crumple their children into an overlapping ring and edges read clearly against the #0a0c10 canvas.

## What Was Built

**Task 1 (auto) — complete:**
- **PART A — dependency:** `pnpm --filter web add d3-force` → `d3-force@^3.0.0`; `pnpm --filter web add -D @types/d3-force` → `@types/d3-force@^3.0.10`. Both updated `apps/web/package.json` and the root `pnpm-lock.yaml`. No postinstall/build issues (the only warning was a pre-existing react peer mismatch in `apps/mobile`, unrelated).
- **PART B — layout forces:** Added `import { forceCollide } from "d3-force"` and a new `useEffect` keyed on `[graphData, dims]`, guarded against a null `fgRef.current`. Inside it configures imperatively on the existing engine:
  - `d3Force("collide", forceCollide((n) => 4 * Math.sqrt(n.val) + 5))` (the core fix; untyped arg annotated with the existing biome-ignore convention)
  - `d3Force("charge")?.strength(-110)`
  - `d3Force("link")?.distance(48)`
  - `d3ReheatSimulation()`
- **PART C — edge visibility:** Base `linkColor` `rgba(148,163,184,0.18)` → `rgba(148,163,184,0.40)`; base `linkWidth` `0.5` → `1.0`. Highlighted (selected-connected) branch left at `rgba(255,255,255,0.55)` @ width `1.4` so it stays distinct above the brighter base.

Only the three permitted files were touched. No dead code, no backwards-compat shims, no data-pipeline changes.

## Verification

- **Typecheck:** `pnpm --filter web typecheck` introduces ZERO new errors. The only failures are the 6 pre-existing, unrelated errors in `tests/api-jarvis-tts.test.ts` (NextRequest vs Request typing). `GraphExplorer.tsx` is clean.

## Deviations from Plan

None — plan executed exactly as written. All force values used the plan's primary recommended numbers (charge -110, link distance 48, collision padding +5).

## Task 2 — Human-verify checkpoint (NOT satisfied here; visual)

This is a visual change that cannot be verified headlessly. In the browser:
1. Start the dev server: `pnpm --filter web dev`, then open `/graph`.
2. Click the Area "Yale" (or any Area with ~20+ child Projects).
3. Confirm the children spread into a clean radial layout — NO overlapping/crumpled ring of project nodes.
4. Confirm edges are clearly visible against the `#0a0c10` canvas at default zoom (not the old near-invisible hairlines).
5. Confirm a selected node's connected edges are still visually distinct (brighter/thicker) above the new base.

If the spread is too sparse/tight or edges are still faint, the VISUAL knobs to nudge are charge (~-90..-140), link distance (~40-60), and collision padding (currently +5).

## Self-Check: PASSED

- FOUND: apps/web/app/(app)/graph/GraphExplorer.tsx (modified — imports forceCollide, configures collide/charge/link + reheat, edges bumped)
- FOUND: apps/web/package.json (d3-force ^3.0.0 in dependencies, @types/d3-force ^3.0.10 in devDependencies)
- FOUND: pnpm-lock.yaml (updated)
- FOUND commit: 96fe83b (3 files changed, 42 insertions, 2 deletions; no file deletions)
