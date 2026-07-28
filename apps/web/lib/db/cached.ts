import "server-only";

import { loadHabits } from "@/lib/context/nodes/habits";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getHashtagSuggestions } from "@/lib/db/queries/hashtags";
import { getJournalEntriesForUser } from "@/lib/db/queries/journal";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getSidebarTree } from "@/lib/db/queries/sidebar";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
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

/** Deduped across `layout.tsx` (both the archived and non-archived trees) and the search snapshot. */
export const getSidebarTreeCached = cache((userId: string, includeArchived: boolean) =>
  getSidebarTree(userId, includeArchived)
);

/**
 * Deduped between the search snapshot and any route that also loads the full
 * task list. `app/(app)/tasks/page.tsx` still calls the raw helper: it is not
 * this unit's file, and once the snapshot leaves the layout's blocking path the
 * duplicate stops happening on that route anyway.
 */
export const getAllTasksForUserCached = cache((userId: string) => getAllTasksForUser(userId));

export const getHashtagSuggestionsCached = cache((userId: string) => getHashtagSuggestions(userId));

export const getCapturesForUserCached = cache((userId: string, limit: number) =>
  getCapturesForUser(userId, { limit })
);

export const getPagesForUserCached = cache((userId: string) => getPagesForUser(userId));

export const getJournalEntriesForUserCached = cache((userId: string) =>
  getJournalEntriesForUser(userId)
);

export const loadHabitsCached = cache((userId: string) => loadHabits(userId));
