import "server-only";

import { loadHabits } from "@/lib/context/nodes/habits";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { getJournalEntriesForUser } from "@/lib/db/queries/journal";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { cache } from "react";

/**
 * Per-request memoization for the helpers that sit on the layout's critical
 * path.
 *
 * The cost this removes is measured, not theoretical: `getSidebarTree` ran
 * three times per render (twice in the layout, once inside the search
 * snapshot), `getAllTasksForUser` ran twice on `/tasks`, and the whole `(app)`
 * layout cost 25 to 34 serialized Postgres round-trips on a one-connection
 * pool. `React.cache` is per request, so nothing crosses requests and there is
 * no staleness window to reason about.
 *
 * **These wrappers live in their own file on purpose.** The helper bodies in
 * `lib/db/queries/*` belong to the performance unit, which is rewriting them in
 * parallel. Memoizing here and rewriting there are different files, so neither
 * change has to wait for the other.
 *
 * Two rules for anything added below:
 *
 *  1. **Primitive arguments only.** `React.cache` keys on argument identity, so
 *     an options object recreated at each call site would miss every time and
 *     silently buy nothing. Where the underlying helper takes an object, the
 *     wrapper flattens it.
 *  2. **No default parameters.** A call passing `(id)` and one passing
 *     `(id, false)` are different cache keys, so a default would split the key
 *     invisibly. Every argument is required here.
 */

/**
 * Deduped across `layout.tsx` and the search snapshot. The layout now asks only
 * for the archived-inclusive tree and derives the active one from it with
 * `activeSidebarTree`, so the two-cache-keys-for-one-question problem is gone
 * as well.
 */
export const getSidebarTreeCached = cache((userId: string, includeArchived: boolean) =>
  getSidebarTree(userId, includeArchived)
);

/** Deduped between `layout.tsx`'s Cmd+K composer and the routes that also render a composer. */
export const getHashtagSuggestionsCached = cache((userId: string) => getHashtagSuggestions(userId));

export const getJournalEntriesForUserCached = cache((userId: string) =>
  getJournalEntriesForUser(userId)
);

export const loadHabitsCached = cache((userId: string) => loadHabits(userId));

/*
 * There are deliberately no wrappers here for `getAllTasksForUser`,
 * `getCapturesForUser` or `getPagesForUser` any more. Their only caller in
 * common with a route was the search snapshot, and the snapshot now reads
 * through `lib/search/snapshot-queries.ts`, which fetches the six or so fields
 * the index uses instead of whole entities. A wrapper whose two callers live in
 * different requests memoizes nothing and only reads as though it does.
 */
