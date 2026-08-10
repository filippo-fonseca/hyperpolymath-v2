// Supabase Realtime → query invalidation, mirroring the web's
// useTableSubscription: one postgres_changes channel per (table, userId),
// module-level refcounted singletons, invalidate-only (payloads are never
// merged into the cache).
//
// Two load-bearing gotchas carried over from web:
//   1. `realtime.setAuth()` MUST resolve before `channel.subscribe()`. A
//      channel that joins while the token push is pending subscribes as the
//      anon role — Realtime acks it (SUBSCRIBED, no error) and RLS silently
//      drops every event. A later setAuth does not re-scope the join.
//   2. DELETEs don't echo (replica identity), so mutations always
//      self-invalidate; realtime is a freshness bonus, not the source of
//      truth.
//
// Realtime requires a Supabase session (Google OAuth). Legacy hpd_ device
// token users fall back to app-state refetch + mutation self-invalidation.

import { AppState } from "react-native";
import { useEffect } from "react";
import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

import { ensureSupabaseClient, getSupabaseAccessToken } from "../lib/supabase";
import { invalidateTable, type InvalidatableTable } from "./invalidate";
import { queryClient } from "./queryClient";

const REALTIME_TABLES: InvalidatableTable[] = [
  "tasks",
  "captures",
  "habits",
  "habit_completions",
  "pages",
  "page_folders",
];

interface Entry {
  channel: RealtimeChannel;
  refs: number;
}

const entries = new Map<string, Entry>();

function channelName(table: string, userId: string): string {
  return `rt:${table}:${userId}`;
}

async function acquire(
  sb: SupabaseClient,
  table: InvalidatableTable,
  userId: string,
): Promise<void> {
  const name = channelName(table, userId);
  const existing = entries.get(name);
  if (existing) {
    existing.refs += 1;
    return;
  }

  const channel = sb
    .channel(name)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table, filter: `user_id=eq.${userId}` },
      () => invalidateTable(table),
    );
  entries.set(name, { channel, refs: 1 });
  channel.subscribe((status) => {
    if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      console.warn(`[realtime] ${name} → ${status}`);
    }
  });
}

function release(table: InvalidatableTable, userId: string): void {
  const name = channelName(table, userId);
  const entry = entries.get(name);
  if (!entry) return;
  entry.refs -= 1;
  if (entry.refs <= 0) {
    entries.delete(name);
    void entry.channel.unsubscribe();
  }
}

let activeUserId: string | null = null;

/**
 * Subscribe the standard table set for a signed-in user. Called by the shell
 * after auth resolves. Safe to call repeatedly (idempotent per user).
 */
export async function startRealtime(userId: string): Promise<void> {
  if (activeUserId === userId) return;
  if (activeUserId) stopRealtime();

  const sb = await ensureSupabaseClient();
  const token = getSupabaseAccessToken();
  if (!sb || !token) return; // device-token auth: no realtime, polling covers it

  // Gotcha #1: push the JWT to the realtime socket BEFORE any join.
  await sb.realtime.setAuth(token);

  activeUserId = userId;
  for (const table of REALTIME_TABLES) {
    await acquire(sb, table, userId);
  }
}

export function stopRealtime(): void {
  if (!activeUserId) return;
  for (const table of REALTIME_TABLES) {
    release(table, activeUserId);
  }
  activeUserId = null;
}

/**
 * Coarse freshness net: whenever the app returns to the foreground, mark
 * everything stale. Active queries refetch immediately; inactive ones
 * refetch on next mount.
 */
export function useAppStateRefetch(): void {
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void queryClient.invalidateQueries();
      }
    });
    return () => sub.remove();
  }, []);
}
