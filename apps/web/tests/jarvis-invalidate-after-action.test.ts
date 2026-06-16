/**
 * Issue #17 — JARVIS post-action TanStack Query invalidation.
 *
 * Verifies invalidateAfterJarvisAction fans out to the correct query keys for
 * each tool family so created / updated / deleted entities (and undos) refresh
 * the relevant lists immediately, independent of the flaky Supabase Realtime
 * echo. This is the root-cause fix for actions "sometimes not showing".
 */

import { describe, expect, it, vi } from "vitest";
import type { QueryClient } from "@tanstack/react-query";
import { invalidateAfterJarvisAction } from "@/lib/jarvis/invalidate-after-action";

const USER = "user-123";

function makeStubClient() {
  const calls: unknown[][] = [];
  const qc = {
    invalidateQueries: vi.fn((arg: { queryKey: unknown[] }) => {
      calls.push(arg.queryKey);
    }),
  } as unknown as QueryClient;
  return { qc, calls };
}

/** Serialize the recorded query keys for easy membership assertions. */
function keyStrings(calls: unknown[][]): string[] {
  return calls.map((k) => JSON.stringify(k));
}

describe("invalidateAfterJarvisAction", () => {
  it("invalidates tasks + project links for every task mutation", () => {
    for (const name of ["create_task", "update_task", "delete_task"]) {
      const { qc, calls } = makeStubClient();
      invalidateAfterJarvisAction(qc, name, USER);
      const keys = keyStrings(calls);
      expect(keys).toContain(JSON.stringify(["tasks", USER]));
      expect(keys).toContain(JSON.stringify(["tasks_projects", USER]));
      expect(keys).toContain(JSON.stringify(["projects", USER]));
    }
  });

  it("invalidates captures + hashtag/project joins for every capture mutation", () => {
    for (const name of ["create_capture", "update_capture", "delete_capture"]) {
      const { qc, calls } = makeStubClient();
      invalidateAfterJarvisAction(qc, name, USER);
      const keys = keyStrings(calls);
      expect(keys).toContain(JSON.stringify(["captures", USER]));
      expect(keys).toContain(JSON.stringify(["captures_hashtags", USER]));
      expect(keys).toContain(JSON.stringify(["captures_projects", USER]));
      expect(keys).toContain(JSON.stringify(["hashtags", USER]));
    }
  });

  it("invalidates the calendar-events prefix for every event mutation", () => {
    for (const name of ["create_event", "update_event", "delete_event"]) {
      const { qc, calls } = makeStubClient();
      invalidateAfterJarvisAction(qc, name, USER);
      // Prefix-only key so every visible-cal / date-range slice refreshes.
      expect(keyStrings(calls)).toContain(
        JSON.stringify(["calendar-events", USER]),
      );
    }
  });

  it("invalidates jarvis_facts for remember/forget fact", () => {
    for (const name of ["remember_fact", "forget_fact"]) {
      const { qc, calls } = makeStubClient();
      invalidateAfterJarvisAction(qc, name, USER);
      expect(keyStrings(calls)).toContain(
        JSON.stringify(["jarvis_facts", USER]),
      );
    }
  });

  it("is a no-op for non-mutating / unknown tools", () => {
    for (const name of ["find_tasks", "find_captures", "find_events", "ask_clarification", "totally_unknown"]) {
      const { qc, calls } = makeStubClient();
      invalidateAfterJarvisAction(qc, name, USER);
      expect(calls).toHaveLength(0);
    }
  });

  it("is a no-op when userId is missing (guards anonymous edge case)", () => {
    const { qc, calls } = makeStubClient();
    invalidateAfterJarvisAction(qc, "create_task", "");
    expect(calls).toHaveLength(0);
  });
});
