"use client";

import type { QueryClient } from "@tanstack/react-query";
import { tableKey } from "@/lib/realtime/query-keys";

/**
 * Client-side TanStack Query invalidation for JARVIS mutations.
 *
 * Issue #17: after JARVIS creates / updates / deletes an entity the receipt
 * surfaced, but the actual list (tasks, captures, calendar) only refreshed
 * when the Supabase Realtime echo happened to fire. Realtime is best-effort:
 * the channel can be in CHANNEL_ERROR / TIMED_OUT, the relevant page may not
 * have the subscription mounted, or (for calendar) gcal events live in Google
 * Calendar and never broadcast a postgres_changes event at all. The combined
 * QueryProvider config (`refetchOnMount: false`, `refetchOnWindowFocus: false`)
 * means nothing else refetches, so the change "sometimes" never showed.
 *
 * This module maps a JARVIS tool name to the query keys it touches and
 * invalidates them DIRECTLY on the client, immediately, independent of the
 * Realtime round-trip. Realtime invalidation still runs (it's idempotent —
 * invalidate-only), so this is purely additive and safe.
 *
 * Used for both the forward action (onAction) and undo (handleUndoAction):
 * undo mutates the same tables, so the same key set must refresh.
 */

/** Invalidate by [table, userId] prefix. */
function invalidateTable(qc: QueryClient, table: Parameters<typeof tableKey>[0], userId: string): void {
  void qc.invalidateQueries({ queryKey: tableKey(table, userId) });
}

/** Invalidate every calendar-events query (any visible-cal / date-range slice). */
function invalidateCalendar(qc: QueryClient, userId: string): void {
  // Partial-prefix match — CalendarClient keys are
  // ["calendar-events", userId, calIds, timeMin, timeMax]. Invalidating the
  // ["calendar-events", userId] prefix fans out to every slice.
  void qc.invalidateQueries({ queryKey: ["calendar-events", userId] });
}

/**
 * Invalidate the TanStack Query keys affected by a single JARVIS tool call.
 *
 * Tolerant of unknown / non-mutating tool names (find_*, ask_clarification)
 * which simply invalidate nothing.
 */
export function invalidateAfterJarvisAction(
  qc: QueryClient,
  toolName: string,
  userId: string,
): void {
  if (!userId) return;

  if (toolName === "create_task" || toolName === "update_task" || toolName === "delete_task") {
    invalidateTable(qc, "tasks", userId);
    // Tasks carry project links; the projects tree shows per-project counts.
    invalidateTable(qc, "tasks_projects", userId);
    invalidateTable(qc, "projects", userId);
    return;
  }

  if (
    toolName === "create_capture" ||
    toolName === "update_capture" ||
    toolName === "delete_capture"
  ) {
    invalidateTable(qc, "captures", userId);
    invalidateTable(qc, "captures_hashtags", userId);
    invalidateTable(qc, "captures_projects", userId);
    invalidateTable(qc, "hashtags", userId);
    return;
  }

  if (toolName === "create_event" || toolName === "update_event" || toolName === "delete_event") {
    invalidateCalendar(qc, userId);
    return;
  }

  if (toolName === "remember_fact" || toolName === "forget_fact") {
    invalidateTable(qc, "jarvis_facts", userId);
    return;
  }

  // Issue #104: create_person adds a roster entry; link_people adds person
  // references (which bump per-person reference counts). Both refresh the
  // People roster; link_people also touches the references join.
  if (toolName === "create_person") {
    invalidateTable(qc, "people", userId);
    return;
  }
  if (toolName === "link_people") {
    invalidateTable(qc, "people", userId);
    invalidateTable(qc, "people_references", userId);
    return;
  }

  if (toolName === "control_lights" || toolName === "list_lights") {
    // Sidebar strip + Studio HOME widget (desktop shares the studio key shape).
    // Refetch immediately, then again shortly after — Govee cloud state can lag
    // the control ACK by a few hundred ms, so one read often shows the old value.
    const keys = [["home-lights-state"], ["studio", "home"]] as const;
    for (const queryKey of keys) {
      void qc.invalidateQueries({ queryKey });
      void qc.refetchQueries({ queryKey, type: "active" });
    }
    if (toolName === "control_lights" && typeof window !== "undefined") {
      window.setTimeout(() => {
        for (const queryKey of keys) {
          void qc.refetchQueries({ queryKey, type: "active" });
        }
      }, 700);
      window.setTimeout(() => {
        for (const queryKey of keys) {
          void qc.refetchQueries({ queryKey, type: "active" });
        }
      }, 1600);
    }
    return;
  }

  // find_*, ask_clarification, unknown — nothing to invalidate.
}
