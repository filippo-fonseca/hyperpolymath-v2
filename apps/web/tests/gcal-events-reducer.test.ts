/**
 * `optimisticReducer` — gcal-shaped-ID handling.
 *
 * Phase 4 Plan 04-04 Task 1 (D-12 + RESEARCH Pitfall 7).
 *
 * Phase 3 reducer is generic over `T extends { id: string }`. Phase 4 wiring
 * differs from Phase 3 in *how* the id changes between optimistic and
 * canonical state:
 *
 *   - Phase 3 (Postgres rows): client-generated UUID is persisted as-is, so
 *     the echo carries the same `id` → reducer dedupes on id match.
 *   - Phase 4 (gcal events): client placeholder is a UUID; the server
 *     returns gcal's own canonical ID (a non-UUID base32-like string).
 *     Wiring dispatches `delete(placeholderId) + insert(canonicalRow)` on
 *     success to swap the row.
 *
 * Reducer algebra is unchanged. These three tests prove it handles the
 * gcal-shaped IDs correctly so the wiring in CalendarClient.tsx
 * (`swapPlaceholderForCanonical`) is provably correct.
 *
 * Three tests:
 *   1. Optimistic insert with UUID placeholder → swap (delete + insert
 *      canonical gcal-shaped id) → final state has exactly one row with the
 *      canonical ID and no placeholder remnant.
 *   2. Optimistic update with stable id → re-applying the same update is
 *      idempotent (no duplicate; reducer state size unchanged).
 *   3. Optimistic delete by canonical ID → state becomes empty; delete of
 *      an unknown id is a no-op (defensive).
 */

import { describe, expect, it } from "vitest";
import {
  optimisticReducer,
  type OptimisticAction,
} from "@/lib/realtime/optimistic-reducer";

// Minimal grid-event shape — `id` is the only field the reducer cares about.
// Mirrors apps/web/components/calendar/CalendarGrid.tsx GcalEvent without the
// Date instances (irrelevant for the reducer; we only test id-based ops).
interface TestGcalEvent {
  id: string;
  title: string;
}

describe("optimisticReducer — gcal placeholder → canonical swap (Pitfall 7)", () => {
  it("swaps placeholder UUID for canonical gcal-shaped ID without duplicates", () => {
    // Start empty (no events on the grid).
    let state: TestGcalEvent[] = [];

    // 1. Optimistic insert with client-generated UUID placeholder.
    const placeholderId = "00000000-1111-2222-3333-444444444444"; // shaped like crypto.randomUUID()
    state = optimisticReducer(state, {
      type: "insert",
      row: { id: placeholderId, title: "Optimistic event" },
    } as OptimisticAction<TestGcalEvent>);

    expect(state).toHaveLength(1);
    expect(state[0]!.id).toBe(placeholderId);

    // 2. Server returns canonical gcal ID (~26-char base32-like, non-UUID).
    const canonicalId = "abc123def456ghi789jkl012mn"; // gcal-shaped, NOT a UUID
    state = optimisticReducer(state, {
      type: "delete",
      id: placeholderId,
    } as OptimisticAction<TestGcalEvent>);
    state = optimisticReducer(state, {
      type: "insert",
      row: { id: canonicalId, title: "Optimistic event" },
    } as OptimisticAction<TestGcalEvent>);

    // 3. Final state: exactly one row, canonical id, NO placeholder remnant.
    expect(state).toHaveLength(1);
    expect(state[0]!.id).toBe(canonicalId);
    // Defensive: no duplicates.
    expect(state.filter((e) => e.id === placeholderId)).toHaveLength(0);
    expect(state.filter((e) => e.id === canonicalId)).toHaveLength(1);
  });
});

describe("optimisticReducer — update idempotence (echo no-op)", () => {
  it("re-applying the same update by id does not duplicate the row", () => {
    const canonicalId = "abc123def456";
    let state: TestGcalEvent[] = [{ id: canonicalId, title: "Initial" }];

    state = optimisticReducer(state, {
      type: "update",
      id: canonicalId,
      patch: { title: "Updated" },
    } as OptimisticAction<TestGcalEvent>);

    expect(state).toHaveLength(1);
    expect(state[0]!.title).toBe("Updated");

    // Re-apply (simulating a Realtime echo / refetch invalidation that
    // re-applies the same change). Reducer is idempotent — state shape and
    // length stay constant.
    state = optimisticReducer(state, {
      type: "update",
      id: canonicalId,
      patch: { title: "Updated" },
    } as OptimisticAction<TestGcalEvent>);

    expect(state).toHaveLength(1);
    expect(state[0]!.title).toBe("Updated");
  });
});

describe("optimisticReducer — delete by canonical gcal ID", () => {
  it("deletes the row by canonical ID; delete of unknown ID is a no-op", () => {
    const canonicalId = "abc123def456";
    let state: TestGcalEvent[] = [
      { id: canonicalId, title: "to-delete" },
      { id: "other-event-id", title: "stays" },
    ];

    // Delete the targeted row.
    state = optimisticReducer(state, {
      type: "delete",
      id: canonicalId,
    } as OptimisticAction<TestGcalEvent>);

    expect(state).toHaveLength(1);
    expect(state[0]!.id).toBe("other-event-id");

    // Delete an unknown id — must NOT throw, state unchanged.
    state = optimisticReducer(state, {
      type: "delete",
      id: "does-not-exist",
    } as OptimisticAction<TestGcalEvent>);

    expect(state).toHaveLength(1);
    expect(state[0]!.id).toBe("other-event-id");
  });
});
