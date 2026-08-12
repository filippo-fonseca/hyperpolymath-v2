"use client";

import { useQuery } from "@tanstack/react-query";
import type { XpBadge } from "@/lib/db/queries/xp";
import { tableKey } from "@/lib/realtime/query-keys";
import { useTableSubscription } from "@/lib/realtime/useTableSubscription";

/**
 * The shared XP badge subscription.
 *
 * Several surfaces want the same tiny payload (the sidebar badge, the award
 * notifier), and `useTableSubscription` already refcounts one Supabase channel
 * per table+user however many components mount it. Sharing the query key on
 * top of that means N consumers cost one channel and one fetch.
 */
export const XP_BADGE_KEY = "xp-badge";

export function useXpBadge(userId: string, initial?: XpBadge) {
  const query = useQuery<XpBadge>({
    queryKey: [XP_BADGE_KEY, userId],
    queryFn: async () => {
      const res = await fetch("/api/xp/badge", { cache: "no-store" });
      if (!res.ok) throw new Error("failed to load xp badge");
      return res.json();
    },
    initialData: initial,
    // XP only moves when the ledger does, and realtime tells us that.
    staleTime: 60_000,
  });

  // A new ledger row is the signal. user_xp changes in the same transaction,
  // but subscribing to the ledger is what makes the "+15 XP" toast possible,
  // and one invalidation covers both.
  useTableSubscription("xp_events", userId, {
    alsoInvalidate: [[XP_BADGE_KEY, userId] as const],
  });

  return query;
}

/** So consumers can invalidate without re-deriving the key shape. */
export function xpBadgeKey(userId: string): readonly [string, string] {
  return [XP_BADGE_KEY, userId] as const;
}

export type { XpBadge };

/** Keeps the realtime key export honest if someone renames the table union. */
export const XP_EVENTS_KEY = (userId: string) => tableKey("xp_events", userId);
