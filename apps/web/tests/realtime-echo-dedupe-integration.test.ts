import { describe, it, expect } from "vitest";
import { optimisticReducer } from "@/lib/realtime/optimistic-reducer";

type CaptureRow = {
  id: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * RT-05 end-to-end echo dedupe.
 *
 * Walks the full optimistic → server-persist → Realtime-echo loop for the
 * three CRUD shapes (insert / update / delete) and asserts that the echo
 * round-trip is idempotent — the user sees exactly one row state at every
 * step; no duplicate, no flicker, no drift between optimistic and canonical.
 *
 * Lifecycle modeled here:
 *   1. UI generates `crypto.randomUUID()` and dispatches optimistic insert
 *      via the reducer. Optimistic state contains the new row.
 *   2. Server Action persists with that UUID (RT-05 caller-id flow, set up
 *      by Plans 03-02 / 03-03). The persisted row's id matches.
 *   3. Realtime fires `invalidateQueries`; TanStack Query refetches; the
 *      refetched canonical state contains the same row.
 *   4. React 19 `useOptimistic` reapplies the still-pending optimistic
 *      action on top of the canonical state. The reducer's RT-05 dedupe
 *      branch must no-op the insert (same id), preserving exactly one row.
 *
 * This is the load-bearing contract for "feels instant + stays correct
 * after the echo arrives." Without it, every create would briefly
 * duplicate after ~150ms (the Realtime delivery window).
 */
describe("Optimistic → Realtime echo dedupe (RT-05 end-to-end)", () => {
  it("client UUID flows through and Realtime echo is a no-op", () => {
    // 1. Initial state: empty feed
    let state: CaptureRow[] = [];

    // 2. Client generates UUID and dispatches optimistic insert
    const clientUuid = crypto.randomUUID();
    const optimisticRow: CaptureRow = {
      id: clientUuid,
      content: "live test",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    state = optimisticReducer<CaptureRow>(state, {
      type: "insert",
      row: optimisticRow,
    });
    expect(state).toHaveLength(1);
    expect(state[0].id).toBe(clientUuid);

    // 3. Simulate Server Action persisting with the same UUID — the server
    //    respects the caller-supplied id (Plan 03-02 / 03-03 schemas accept
    //    z.string().uuid().optional() and spread `...(parsed.data.id ? { id } : {})`).
    const persistedRow: CaptureRow = {
      id: clientUuid,
      content: "live test",
      createdAt: optimisticRow.createdAt,
      updatedAt: new Date(),
    };

    // 4. Simulate Realtime echo: TanStack Query refetches and returns
    //    [persistedRow] as the canonical state. The reducer is reapplied
    //    fresh to that canonical state, with the optimistic action still
    //    pending (this is the React 19 useOptimistic semantics).
    const canonical = [persistedRow];
    const merged = optimisticReducer<CaptureRow>(canonical, {
      type: "insert",
      row: optimisticRow,
    });

    // 5. Assert: the echo is a no-op — no duplicate row, exactly one row,
    //    with the same id the client minted.
    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe(clientUuid);
  });

  it("update echo with same id is idempotent", () => {
    const id = crypto.randomUUID();
    let state: CaptureRow[] = [
      { id, content: "old", createdAt: new Date(), updatedAt: new Date() },
    ];

    // Optimistic update
    state = optimisticReducer<CaptureRow>(state, {
      type: "update",
      id,
      patch: { content: "new" },
    });
    expect(state[0].content).toBe("new");

    // Realtime echo: server returns the canonical updated row; reducer
    // reapplies the optimistic patch. Result is identical to the canonical
    // because the patch already matches the persisted state.
    const canonical: CaptureRow[] = [
      {
        id,
        content: "new",
        createdAt: state[0].createdAt,
        updatedAt: new Date(),
      },
    ];
    const merged = optimisticReducer<CaptureRow>(canonical, {
      type: "update",
      id,
      patch: { content: "new" },
    });
    expect(merged).toEqual(canonical);
  });

  it("delete echo with same id is idempotent (deleted stays deleted)", () => {
    const id = crypto.randomUUID();
    let state: CaptureRow[] = [
      { id, content: "x", createdAt: new Date(), updatedAt: new Date() },
    ];

    // Optimistic delete
    state = optimisticReducer<CaptureRow>(state, { type: "delete", id });
    expect(state).toEqual([]);

    // Realtime DELETE event: canonical refetch returns []. Reapply the
    // optimistic delete on top — still [].
    const canonical: CaptureRow[] = [];
    const merged = optimisticReducer<CaptureRow>(canonical, {
      type: "delete",
      id,
    });
    expect(merged).toEqual([]);
  });
});
