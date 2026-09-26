"use client";

import { type QueryKey, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

/**
 * Hand a Server Component's freshly fetched rows to the TanStack cache, but
 * only when they are newer than what the cache already holds.
 *
 * `initialData` alone cannot do this: it is ignored the moment the key has any
 * data, so a route that SSRs a fresh list still renders whatever an earlier
 * surface left behind. The usual workaround (refetchOnMount: "always") throws
 * the server's work away and re-runs the same query as a server action on
 * every mount, and server actions run one at a time, so a surface with four
 * such queries paid four serialized round trips after it had already rendered.
 *
 * Pair it with `initialData` + `initialDataUpdatedAt: serverTime` on the
 * `useQuery`, which covers the empty-cache case during render; this hook
 * covers the populated-cache case after mount. A payload restored from the
 * client Router Cache carries its original `serverTime`, so it never
 * overwrites newer cached rows, and the default stale-based refetch picks it up
 * once it is older than the global staleTime.
 */
export function useSeedQueryData<T>(queryKey: QueryKey, data: T, serverTime: number) {
  const queryClient = useQueryClient();
  // The key is an inline array at every call site, so depend on its content.
  const keyHash = JSON.stringify(queryKey);

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed on keyHash (content, not identity); `data` always travels with `serverTime`
  useEffect(() => {
    const state = queryClient.getQueryState(queryKey);
    if (state && state.dataUpdatedAt >= serverTime) return;
    queryClient.setQueryData(queryKey, data, { updatedAt: serverTime });
  }, [queryClient, keyHash, serverTime]);
}
