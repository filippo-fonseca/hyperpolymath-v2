/**
 * Canonical optimistic reducer for Phase 3 Realtime + useOptimistic.
 *
 * RT-05 dedupe contract: "insert" with an id already in state is a no-op.
 * This is what makes the optimistic + Realtime echo round-trip flicker-free:
 *   1. UI calls addOptimistic({ type: "insert", row: { id: callerUuid, ... } })
 *   2. Server Action persists with that UUID and returns success
 *   3. Realtime echo (INSERT event) arrives → invalidateQueries → refetch
 *   4. Refetched data contains the row with the same id; optimistic state
 *      already has it, so the redux-style merge is a no-op once the
 *      canonical data arrives.
 *
 * Generic over T extends { id: string } so this reducer drives every list-of-rows
 * surface (areas, projects, tasks, captures) with one shape.
 */
export type OptimisticAction<T extends { id: string }> =
  | { type: "insert"; row: T }
  | { type: "update"; id: string; patch: Partial<T> }
  | { type: "delete"; id: string }
  | { type: "reorder"; ids: string[] };

export function optimisticReducer<T extends { id: string }>(
  state: readonly T[],
  action: OptimisticAction<T>,
): T[] {
  switch (action.type) {
    case "insert":
      // RT-05 dedupe: an echo of an already-applied optimistic insert is a
      // no-op. Preserve a stable shallow copy so React picks up state identity
      // changes from no-op transitions if any consumer relies on them.
      if (state.some((r) => r.id === action.row.id)) return state.slice();
      return [action.row, ...state];
    case "update":
      return state.map((r) =>
        r.id === action.id ? ({ ...r, ...action.patch } as T) : r,
      );
    case "delete":
      return state.filter((r) => r.id !== action.id);
    case "reorder": {
      const map = new Map(state.map((r) => [r.id, r]));
      const seen = new Set<string>();
      const out: T[] = [];
      for (const id of action.ids) {
        const row = map.get(id);
        if (row) {
          out.push(row);
          seen.add(id);
        }
      }
      // Append any rows not referenced in ids to avoid data loss on
      // partial reorder payloads (e.g., reorder ids for one status column only).
      for (const r of state) if (!seen.has(r.id)) out.push(r);
      return out;
    }
    default:
      return state.slice();
  }
}
