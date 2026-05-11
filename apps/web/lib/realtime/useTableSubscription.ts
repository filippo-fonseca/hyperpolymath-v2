"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { tableKey, type RealtimeTable } from "./query-keys";
import { registerActiveTable, unregisterActiveTable } from "./visibility";

type Entry = {
  channel: RealtimeChannel;
  refcount: number;
};

/**
 * Module-level singleton: one Supabase RealtimeChannel per (table, userId)
 * regardless of how many components mount useTableSubscription.
 *
 * RT-01: leak-proof — refcount tracks active consumers; cleanup unsubscribes
 * the channel only when the last consumer unmounts.
 *
 * Map lives in module scope. Survives component re-renders. Cleared on full
 * page reload (intentional — fresh channels on cold start).
 */
const channels = new Map<string, Entry>();

function makeKey(table: RealtimeTable, userId: string): string {
  return `${table}::${userId}`;
}

/**
 * Subscribe to Supabase Realtime postgres_changes for one (table, userId)
 * pair. Invalidates the matching TanStack Query cache on every event.
 *
 * D-08: singleton channel — multiple component mounts share one channel.
 * D-09: invalidate only — never merge payloads (Critical Pattern 3).
 * D-11: registers with visibility coordinator so backgrounded tabs recover.
 *
 * @param table - Realtime-enabled Postgres table name (must be in RealtimeTable union)
 * @param userId - The signed-in user's id; filters RLS-aware broadcasts to this user
 * @param options.enabled - If false, hook is a no-op. Useful for guarded mounts.
 */
export function useTableSubscription(
  table: RealtimeTable,
  userId: string,
  options: { enabled?: boolean } = {},
): void {
  const enabled = options.enabled ?? true;
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    if (!userId) return;

    const key = makeKey(table, userId);

    // Visibility registry — single source of truth for "what tables need
    // refetch on visibilitychange → visible". Refcounted in visibility.ts.
    registerActiveTable(table, userId);

    const existing = channels.get(key);
    if (existing) {
      existing.refcount += 1;
    } else {
      const supabase = createClient();
      const channel = supabase
        .channel(`rt:${table}:${userId}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table,
            filter: `user_id=eq.${userId}`,
          },
          () => {
            // D-09 / Critical Pattern 3: invalidate-only — never merge the
            // payload row into the cache directly. Refetch guarantees consistency.
            void queryClient.invalidateQueries({
              queryKey: tableKey(table, userId),
            });
          },
        )
        .subscribe();
      channels.set(key, { channel, refcount: 1 });
    }

    return () => {
      unregisterActiveTable(table, userId);
      const entry = channels.get(key);
      if (!entry) return;
      entry.refcount -= 1;
      if (entry.refcount <= 0) {
        void entry.channel.unsubscribe();
        channels.delete(key);
      }
    };
  }, [table, userId, enabled, queryClient]);
}

/** Test-only — inspect module state. */
export function __getChannelMapForTests(): ReadonlyMap<
  string,
  { refcount: number }
> {
  return new Map(
    Array.from(channels.entries()).map(([k, v]) => [k, { refcount: v.refcount }]),
  );
}

/** Test-only — reset module state between tests (clears all channels). */
export function __resetChannelsForTests(): void {
  for (const entry of channels.values()) void entry.channel.unsubscribe();
  channels.clear();
}
