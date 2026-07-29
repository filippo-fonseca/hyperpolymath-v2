"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { REALTIME_SUBSCRIBE_STATES, type RealtimeChannel } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { tableKey, type RealtimeTable } from "./query-keys";
import { registerActiveTable, unregisterActiveTable } from "./visibility";

type Entry = {
  channel: RealtimeChannel;
  refcount: number;
  /**
   * Cross-key fanout — serialized JSON of each [string, string] query key that
   * should ALSO be invalidated when this channel fires. Accrued across mounts:
   * if two consumers mount the same (table, userId) with different
   * `alsoInvalidate` arrays, the entry's extraKeys is the union, and the union
   * is applied on every fire. Cleared implicitly when refcount→0 deletes the
   * entry (D-10).
   */
  extraKeys: Set<string>;
  /**
   * Per-mount `onEvent` callbacks (D-12). Same refcount lifetime as the
   * channel: a mount adds its listener and removes it on unmount, so a
   * consumer that wants to *schedule* work off an event (rather than
   * invalidate a key straight away) can do so without the channel firing an
   * expensive refetch on its behalf.
   */
  listeners: Set<() => void>;
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
 * D-10: optional `alsoInvalidate` — cross-key fanout for join tables (e.g.
 *       subscribing to `captures_hashtags` ALSO invalidates the `["hashtags",
 *       userId]` and `["captures", userId]` queries so hashtag counts and
 *       feed-card chip lists update live as the join changes).
 * D-11: registers with visibility coordinator so backgrounded tabs recover.
 *
 * @param table - Realtime-enabled Postgres table name (must be in RealtimeTable union)
 * @param userId - The signed-in user's id; filters RLS-aware broadcasts to this user
 * @param options.enabled - If false, hook is a no-op. Useful for guarded mounts.
 * @param options.alsoInvalidate - Extra query keys to invalidate on every fire.
 *   The singleton accrues keys across mounts: if multiple consumers mount the
 *   same (table, userId) with different alsoInvalidate arrays, the union is
 *   applied. Stale keys are released implicitly when refcount→0 deletes the
 *   entry on the last unmount.
 * @param options.onEvent - D-12: called on every fire, in addition to the
 *   invalidations above. For consumers whose refetch is expensive enough that
 *   it wants coalescing (the search snapshot is 18 queries, and a single user
 *   action can touch three of the tables that feed it), so the consumer
 *   debounces its own invalidation instead of paying once per table. The
 *   callback is read through a ref, so passing a fresh closure every render
 *   does not re-subscribe the channel.
 */
export function useTableSubscription(
  table: RealtimeTable,
  userId: string,
  options: {
    enabled?: boolean;
    alsoInvalidate?: ReadonlyArray<readonly [string, string]>;
    onEvent?: () => void;
  } = {},
): void {
  const enabled = options.enabled ?? true;
  const onEventRef = useRef(options.onEvent);
  onEventRef.current = options.onEvent;
  const extraKeysJson = (options.alsoInvalidate ?? []).map((k) =>
    JSON.stringify(k),
  );
  // Stable dep — a single string that captures the set of extra keys for this
  // mount. Avoids array-identity churn re-running the effect every render.
  const extraKeysDep = extraKeysJson.join("|");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    if (!userId) return;

    const key = makeKey(table, userId);
    // Stable per-mount listener that reads the latest callback off the ref.
    const listener = () => onEventRef.current?.();

    // Visibility registry — single source of truth for "what tables need
    // refetch on visibilitychange → visible". Refcounted in visibility.ts.
    registerActiveTable(table, userId);

    const existing = channels.get(key);
    if (existing) {
      existing.refcount += 1;
      // Accrue this mount's extra keys onto the shared entry (D-10 fanout
      // union across consumers).
      for (const k of extraKeysJson) existing.extraKeys.add(k);
      existing.listeners.add(listener);
    } else {
      const extraKeys = new Set<string>(extraKeysJson);
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
            // D-10 fanout — invalidate every extra key registered on this
            // singleton entry. Read live from `channels.get(key)` so any later
            // mounts that accrued additional keys are honored too.
            const entry = channels.get(key);
            if (entry) {
              for (const serialized of entry.extraKeys) {
                const parsed = JSON.parse(serialized) as readonly [
                  string,
                  string,
                ];
                void queryClient.invalidateQueries({ queryKey: parsed });
              }
              // D-12 — notify consumers that coalesce their own refetch.
              for (const notify of entry.listeners) notify();
            }
          },
        );
      // Resolve the user JWT BEFORE the join goes out. A channel that joins
      // while the async accessToken callback is still pending subscribes as
      // the anon role: Realtime acks it (SUBSCRIBED fires, no error), and
      // then RLS silently drops every event, because postgres_changes are
      // scoped to the claims carried by the join itself — the token pushed
      // later by setAuth does not re-scope an existing subscription.
      // setAuth() awaits the accessToken callback and caches the token, so
      // the join payload carries the user JWT.
      void supabase.realtime
        .setAuth()
        .catch(() => {
          // Signed out or storage race — join proceeds as anon, which is
          // today's behavior; the status callback below stays observable.
        })
        .then(() => {
          // The last consumer may have unmounted while auth resolved; the
          // refcount cleanup already dropped the entry, so joining now would
          // leak a channel nobody unsubscribes.
          if (channels.get(key)?.channel !== channel) return;
          channel.subscribe((status, err) => {
            // RT-OBS: surface channel subscription status so failures are
            // observable in the console rather than silently dropping events.
            if (status === REALTIME_SUBSCRIBE_STATES.SUBSCRIBED) {
              // Channel is live — postgres_changes events will flow.
              if (process.env.NODE_ENV !== "production") {
                console.debug(`[realtime] SUBSCRIBED rt:${table}:${userId}`);
              }
            } else if (
              status === REALTIME_SUBSCRIBE_STATES.CHANNEL_ERROR ||
              status === REALTIME_SUBSCRIBE_STATES.TIMED_OUT
            ) {
              console.warn(
                `[realtime] ${status} rt:${table}:${userId}`,
                err ?? "",
              );
            }
          });
        });
      channels.set(key, {
        channel,
        refcount: 1,
        extraKeys,
        listeners: new Set([listener]),
      });
    }

    return () => {
      unregisterActiveTable(table, userId);
      const entry = channels.get(key);
      if (!entry) return;
      entry.listeners.delete(listener);
      entry.refcount -= 1;
      if (entry.refcount <= 0) {
        void entry.channel.unsubscribe();
        channels.delete(key);
      }
      // NOTE: We do NOT remove this mount's contribution to `extraKeys` on
      // partial unmount. The remaining consumers may still want the fanout,
      // and over-removing risks dropping a key that another consumer still
      // depends on. Cleanup happens implicitly when refcount→0 deletes the
      // entry above.
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, userId, enabled, queryClient, extraKeysDep]);
}

/** Test-only — inspect module state. */
export function __getChannelMapForTests(): ReadonlyMap<
  string,
  { refcount: number; extraKeys: ReadonlyArray<string> }
> {
  return new Map(
    Array.from(channels.entries()).map(([k, v]) => [
      k,
      { refcount: v.refcount, extraKeys: Array.from(v.extraKeys) },
    ]),
  );
}

/** Test-only — reset module state between tests. */
export function __resetChannelsForTests(): void {
  for (const entry of channels.values()) void entry.channel.unsubscribe();
  channels.clear();
}
