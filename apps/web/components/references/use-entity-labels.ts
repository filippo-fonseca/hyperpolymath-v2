"use client";

import { createContext, useContext, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { resolveEntityLabels } from "@/app/actions/wiki-references";
import { useCurrentUserId } from "@/components/providers/CurrentUserProvider";
import {
  type EntityLabelRequest,
  type ResolvedEntityLabel,
  entityLabelKey,
  labelRequestCacheKey,
  normalizeLabelRequests,
} from "@/lib/references/resolve-labels";
import type { EntityRefType } from "@/lib/references/token";

/**
 * Live label resolution for a whole subtree of entity pills (S7).
 *
 * The shape here is the point. A pill needs to know its target's current name,
 * but a hook inside the pill would mean one query key and one round trip per
 * pill — a capture card mentioning six entities would fire six requests for
 * what is one question. So the *container* resolves: it already holds the raw
 * text, parses it once, and calls `useEntityLabels` a single time. Pills read
 * the answer off context and never fetch.
 *
 * That split is also what lets pills work at all in the JARVIS transcript,
 * where `renderInlineMarkdown` is a plain function returning ReactNode and
 * cannot call a hook of any kind.
 *
 * A pill with no provider above it is not broken — it shows the snapshot label
 * baked into its token. That is the "non-hydrated context" fallback the token
 * contract already promises, so the un-provided case degrades to exactly what
 * the text said before anything resolved it.
 */

/** What a subtree's pills can ask about their targets. */
export interface EntityLabelMap {
  /** The resolved entity, or undefined while nothing has answered yet. */
  get(type: EntityRefType, id: string): ResolvedEntityLabel | undefined;
  /** True while the batch is in flight — pills stay on snapshot labels meanwhile. */
  isPending: boolean;
}

const EMPTY_MAP: EntityLabelMap = {
  get: () => undefined,
  isPending: false,
};

export const EntityLabelsContext = createContext<EntityLabelMap | null>(null);

/**
 * Resolve every ref in a subtree with one request.
 *
 * Keyed by the *sorted* ref set, so two containers asking for the same
 * entities share one cache entry rather than racing two identical fetches.
 * The userId prefix keeps the S7 key family (`["entity-labels", userId, …]`)
 * invalidable in one call and stops a cache entry surviving a user switch.
 */
export function useEntityLabels(
  refs: readonly EntityLabelRequest[],
): EntityLabelMap {
  const userId = useCurrentUserId();

  // `refs` is a fresh array on every render; the cache key is what actually
  // identifies the request, so both the query and the memo below hang off it.
  const cacheKey = useMemo(() => labelRequestCacheKey(refs), [refs]);
  const requests = useMemo(() => normalizeLabelRequests(refs), [refs]);

  const { data, isPending } = useQuery({
    queryKey: ["entity-labels", userId ?? "anon", cacheKey] as const,
    queryFn: () => resolveEntityLabels(requests),
    enabled: requests.length > 0,
    // Labels are titles: they change rarely, and a stale one for a few seconds
    // is invisible. Matches the app-wide default rather than fighting it.
    staleTime: 30_000,
  });

  return useMemo(() => {
    if (!data) {
      return { get: () => undefined, isPending: isPending && cacheKey !== "" };
    }
    const byKey = new Map<string, ResolvedEntityLabel>();
    for (const row of data) byKey.set(entityLabelKey(row.type, row.id), row);
    return {
      get: (type: EntityRefType, id: string) => byKey.get(entityLabelKey(type, id)),
      isPending: false,
    };
  }, [data, isPending, cacheKey]);
}

/** The subtree's resolved labels, or an inert map outside any provider. */
export function useEntityLabelMap(): EntityLabelMap {
  return useContext(EntityLabelsContext) ?? EMPTY_MAP;
}

/** One pill's resolved target. Undefined means "nothing has hydrated this yet". */
export function useResolvedLabel(
  type: EntityRefType,
  id: string,
): ResolvedEntityLabel | undefined {
  return useEntityLabelMap().get(type, id);
}

export type { EntityLabelRequest, ResolvedEntityLabel };
