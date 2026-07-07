"use client";

/**
 * useFocusStack.ts — U-07 · The Studiolo · camera-rig
 *
 * The focus CHAIN. Valid stacks are ONLY prefix chains of
 * `vestibule → bough → lantern` (PLAN §6 U-07). Define `rank`: vestibule=0,
 * bough=1, lantern=2. Invariants: `stack[0]` is always `{kind:'vestibule'}`,
 * and ranks strictly increase along the stack. Every edge case collapses out of
 * those two rules (see `push`/`pop` below).
 *
 * State lives in a MODULE SINGLETON (not React state in CameraRig) so it is
 * reachable both imperatively — mesh `onClick` handlers in U-06/U-10 call
 * `focusStack.push(...)` — and reactively — CameraRig and U-10's hero swap read
 * `useFocusStack()` via `useSyncExternalStore`. Same pattern as `worldEvents`.
 *
 * Cadence: state changes at INTERACTION cadence only (clicks, keys), never per
 * frame (PLAN §7.4). Mutations always create a new array identity; `current()`
 * returns a STABLE reference (the same top object) when nothing changed, so
 * `useSyncExternalStore` never loops.
 */

import { useSyncExternalStore } from "react";

export type FocusLevel =
  | { kind: "vestibule" }
  | { kind: "bough"; areaId: string }
  | { kind: "lantern"; projectId: string }
  | { kind: "ring"; eventId?: string }; // NEW (M-01) — the Meridian Ring

// Phase 2 M-01 orchestrator amendment: the ring is additive and rank-mapped so
// push/pop/truncate semantics stay byte-identical. `{kind:"ring"}` (ring framed
// overhead) is rank 1 — a SIBLING of bough (look-up replaces a bough focus, one
// glide). `{kind:"ring", eventId}` (a specific tablet focused) is rank 2 — a
// SIBLING of lantern, so it can be drilled into from the framed ring
// ([V, ring] → [V, ring, ring+eventId]). CameraRig maps the two ring ranks →
// poses in M-08; M-01 only keeps the exhaustiveness compiling.
function rank(f: FocusLevel): number {
  switch (f.kind) {
    case "vestibule":
      return 0;
    case "bough":
      return 1;
    case "lantern":
      return 2;
    case "ring":
      return f.eventId !== undefined ? 2 : 1;
  }
}

// Deep-equal for a single level (kind + its id field). Used for push dedupe.
function sameLevel(a: FocusLevel, b: FocusLevel): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === "bough" && b.kind === "bough") return a.areaId === b.areaId;
  if (a.kind === "lantern" && b.kind === "lantern")
    return a.projectId === b.projectId;
  if (a.kind === "ring" && b.kind === "ring") return a.eventId === b.eventId;
  return true; // both vestibule
}

function sameStack(a: FocusLevel[], b: FocusLevel[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!sameLevel(a[i]!, b[i]!)) return false;
  }
  return true;
}

// ── Module-level store ──────────────────────────────────────────────────────
let stack: FocusLevel[] = [{ kind: "vestibule" }];
const subs = new Set<() => void>();

function notify(): void {
  for (const fn of Array.from(subs)) fn();
}

export const focusStack = {
  current(): FocusLevel {
    return stack[stack.length - 1]!;
  },

  /**
   * Chain-truncate push (§2.1): keep the prefix of entries with `rank < rank(f)`,
   * then append `f`. Because ranks strictly increase, that prefix is exactly the
   * leading slice, so this is a `slice` + `concat`, not a filter.
   *
   * - Pushing a bough while on another bough REPLACES it ([V,A]→[V,B]): one
   *   glide, no phantom depth.
   * - Pushing a bough while on a lantern truncates to [V,B].
   * - Pushing a level deep-equal to the current top is a NO-OP (no re-glide on
   *   double-click) — caught because the rebuilt stack deep-equals the old one.
   *
   * The lantern convention (§2.6) fires TWO synchronous pushes in one handler;
   * React 19 batches the two `notify()`s → CameraRig re-renders once → ONE flight
   * straight to the lantern. This batching is load-bearing.
   */
  push(f: FocusLevel): void {
    const r = rank(f);
    let cut = stack.findIndex((e) => rank(e) >= r);
    if (cut === -1) cut = stack.length;
    const next = stack.slice(0, cut);
    next.push(f);
    if (sameStack(next, stack)) return; // deep-equal no-op
    stack = next;
    notify();
  },

  /** Remove the top unless it is the vestibule base (pop at vestibule = no-op). */
  pop(): void {
    if (stack.length <= 1) return;
    stack = stack.slice(0, -1);
    notify();
  },

  /** Return to the vestibule base. No-op if already there. */
  reset(): void {
    if (stack.length === 1 && stack[0]!.kind === "vestibule") return;
    stack = [{ kind: "vestibule" }];
    notify();
  },

  subscribe(fn: () => void): () => void {
    subs.add(fn);
    return () => {
      subs.delete(fn);
    };
  },
};

/**
 * Reactive consumer — CameraRig's focus→flight effect and U-10's hero swap.
 * PLAN §6 U-07 shape, verbatim. `getServerSnapshot` (third arg) returns the
 * same `current`: this file lives inside the `ssr:false` island, but
 * `useSyncExternalStore` demands the argument regardless.
 */
export function useFocusStack(): {
  current: FocusLevel;
  push(f: FocusLevel): void;
  pop(): void;
  reset(): void;
} {
  const current = useSyncExternalStore(
    focusStack.subscribe,
    focusStack.current,
    focusStack.current,
  );
  return {
    current,
    push: focusStack.push,
    pop: focusStack.pop,
    reset: focusStack.reset,
  };
}
