"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { OptimisticAction } from "./optimistic-reducer";

/**
 * Hook action union: the shared CRUD actions plus `revert`.
 *
 * `revert` is the explicit rollback that `useOptimistic` used to give for free
 * when its transition closed on error. Because this overlay PERSISTS until
 * canonical reconciles (the whole point — it's what kills the flash), a
 * server rejection must explicitly drop the optimistic op for that id, or the
 * phantom would linger until the next reconciling refetch. Dispatch
 * `{ type: "revert", id }` in every `!success` branch.
 */
export type OptimisticListAction<T extends { id: string }> =
  | OptimisticAction<T>
  | { type: "revert"; id: string }
  | { type: "revert-reorder" };

/**
 * Self-reconciling optimistic list overlay — the flicker-free replacement for
 * `useOptimistic(canonical, optimisticReducer)`.
 *
 * Why this exists (RT-06): React's `useOptimistic` only holds its overlay while
 * the dispatching `startTransition` async fn is still running. The instant that
 * fn returns, React reverts to the canonical TanStack Query cache. The old code
 * bridged the gap by `await`-ing `invalidateQueries` inside the transition, but
 * that bridge is racy: a refetch can resolve BEFORE the just-written row is
 * visible (pooler/replica read-after-write lag) or the Realtime echo can be
 * slow. When the transition then closes, the optimistic row vanishes and only
 * reappears on a later refetch — the "appear → vanish → reappear" flash.
 *
 * This hook instead keeps pending mutations in plain React state (NOT coupled
 * to any transition) and drops each one only once the CANONICAL data has
 * actually caught up:
 *   - insert  → kept until canonical contains the row id
 *   - delete  → kept until canonical no longer contains the id
 *   - update  → kept until canonical reflects the patched fields
 *
 * Because reconciliation is keyed off the canonical data itself (not a timer or
 * the transition lifetime), it is immune to replica lag and slow echoes. A
 * stale refetch that lacks the new row simply doesn't trigger reconciliation,
 * so the optimistic row stays put until a refetch that DOES contain it lands.
 *
 * Drop-in API parity with `useOptimistic`: returns `[items, dispatch]` where
 * `dispatch` accepts the same `OptimisticAction<T>` union as `optimisticReducer`.
 */
export function useOptimisticList<T extends { id: string }>(
  canonical: readonly T[],
): [T[], (action: OptimisticListAction<T>) => void] {
  const [inserts, setInserts] = useState<ReadonlyMap<string, T>>(() => new Map());
  const [updates, setUpdates] = useState<ReadonlyMap<string, Partial<T>>>(
    () => new Map(),
  );
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set());
  const [order, setOrder] = useState<readonly string[] | null>(null);

  // Reconcile pending mutations against canonical whenever it changes. Each
  // setState uses a functional update that returns the SAME reference when
  // nothing changes, so React bails out — no render loop.
  useEffect(() => {
    const byId = new Map(canonical.map((r) => [r.id, r] as const));

    setInserts((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const id of prev.keys()) {
        if (byId.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setRemoved((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const id of prev) {
        if (!byId.has(id)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    setUpdates((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [id, patch] of prev) {
        const row = byId.get(id);
        // Row gone from canonical → the update target no longer exists; drop.
        if (!row) {
          next.delete(id);
          changed = true;
          continue;
        }
        // Canonical now reflects every patched field → optimism fulfilled.
        if (patchSatisfied(row, patch)) {
          next.delete(id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });

    // A reorder override is a one-shot hint: once canonical refetches (server
    // persisted the new positions), let canonical's order win.
    setOrder((prev) => (prev ? null : prev));
  }, [canonical]);

  const dispatch = useCallback((action: OptimisticListAction<T>) => {
    switch (action.type) {
      case "insert": {
        const { row } = action;
        setInserts((prev) => {
          const next = new Map(prev);
          next.set(row.id, row);
          return next;
        });
        // Inserting an id that was optimistically removed un-hides it.
        setRemoved((prev) => {
          if (!prev.has(row.id)) return prev;
          const next = new Set(prev);
          next.delete(row.id);
          return next;
        });
        break;
      }
      case "update": {
        const { id, patch } = action;
        setUpdates((prev) => {
          const next = new Map(prev);
          next.set(id, { ...prev.get(id), ...patch });
          return next;
        });
        // Patch an optimistic insert in place too, so its display value tracks.
        setInserts((prev) => {
          const existing = prev.get(id);
          if (!existing) return prev;
          const next = new Map(prev);
          next.set(id, { ...existing, ...patch });
          return next;
        });
        break;
      }
      case "delete": {
        const { id } = action;
        setRemoved((prev) => {
          if (prev.has(id)) return prev;
          const next = new Set(prev);
          next.add(id);
          return next;
        });
        // A delete of a not-yet-canonical optimistic insert just drops it.
        setInserts((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        break;
      }
      case "reorder": {
        setOrder(action.ids.slice());
        break;
      }
      case "revert": {
        // Explicit rollback to canonical (server rejected the mutation). Drop
        // every pending op for this id — insert, update patch, and any hide.
        const { id } = action;
        setInserts((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setUpdates((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Map(prev);
          next.delete(id);
          return next;
        });
        setRemoved((prev) => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        break;
      }
      case "revert-reorder": {
        // Server rejected a reorder → drop the order override so the list falls
        // back to canonical's (un-reordered) order immediately.
        setOrder((prev) => (prev ? null : prev));
        break;
      }
    }
  }, []);

  const items = useMemo(() => {
    const canonicalIds = new Set(canonical.map((r) => r.id));

    // Canonical rows with any optimistic patch applied.
    let list: T[] = canonical.map((r) => {
      const patch = updates.get(r.id);
      return patch ? ({ ...r, ...patch } as T) : r;
    });

    // Prepend optimistic inserts that canonical hasn't absorbed yet.
    if (inserts.size) {
      const extras: T[] = [];
      for (const [id, row] of inserts) {
        if (canonicalIds.has(id)) continue;
        const patch = updates.get(id);
        extras.push(patch ? ({ ...row, ...patch } as T) : row);
      }
      if (extras.length) list = [...extras, ...list];
    }

    // Hide optimistically-removed rows.
    if (removed.size) list = list.filter((r) => !removed.has(r.id));

    // Apply a pending reorder override (ids first, in order; unknown ids kept).
    if (order) {
      const map = new Map(list.map((r) => [r.id, r] as const));
      const seen = new Set<string>();
      const out: T[] = [];
      for (const id of order) {
        const row = map.get(id);
        if (row) {
          out.push(row);
          seen.add(id);
        }
      }
      for (const r of list) if (!seen.has(r.id)) out.push(r);
      list = out;
    }

    return list;
  }, [canonical, inserts, updates, removed, order]);

  return [items, dispatch];
}

/** True when `row` already reflects every field in `patch` (value equality). */
function patchSatisfied<T extends { id: string }>(
  row: T,
  patch: Partial<T>,
): boolean {
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const a = row[key];
    const b = patch[key];
    if (Object.is(a, b)) continue;
    // Fall back to structural equality for non-primitive fields (e.g. arrays
    // of project chips) so an equal-by-value patch still reconciles.
    if (typeof a === "object" && typeof b === "object") {
      if (JSON.stringify(a) === JSON.stringify(b)) continue;
    }
    return false;
  }
  return true;
}
