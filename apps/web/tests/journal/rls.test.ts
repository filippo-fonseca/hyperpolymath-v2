/**
 * Phase 20 — cross-user RLS isolation for journal_entries.
 *
 * Pattern mirrors apps/web/tests/nutrition/rls.test.ts (NUTR-RLS-01). Two users
 * are created via the admin API, each with a signed-in anon-key client. User A
 * inserts one journal_entries row; User B's client selects journal_entries and
 * must receive an empty result — proving the owner-only RLS quartet enforces
 * user_id = auth.uid().
 *
 * Implements JOURNAL-RLS-01 (cross-user journal_entries isolation).
 *
 * NOTES:
 * - Requires SUPABASE_SERVICE_ROLE_KEY + local Supabase running (migration 0030 applied).
 * - If Docker / local Supabase is not running, tests will fail at createTestUser()
 *   which is the correct failure mode (environment not ready, not a code bug).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/test-users";

describe("Phase 20 journaling — cross-user RLS isolation (JOURNAL-RLS-01)", () => {
  let userA: TestUser;
  let userB: TestUser;

  // ID of the journal_entries row inserted by user A — scopes the select assertions.
  let userAJournalId: string;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY required — set in .env.local for local Supabase"
      );
    }
    userA = await createTestUser();
    userB = await createTestUser();

    // Insert one journal_entries row as user A.
    const { data: entry, error: entryErr } = await userA.client
      .from("journal_entries")
      .insert({
        user_id: userA.id,
        date: "2026-06-19",
        main_response: "Test storyworthy moment",
        notes_section: "rls probe",
      })
      .select()
      .single();
    if (entryErr || !entry) throw new Error(`journal insert failed: ${entryErr?.message}`);
    userAJournalId = entry.id as string;
  }, 30_000);

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  }, 30_000);

  it("user B cannot read user A's journal_entries", async () => {
    // User A can see their own entry.
    const { data: seenByA, error: aErr } = await userA.client
      .from("journal_entries")
      .select("*")
      .eq("id", userAJournalId);
    expect(aErr).toBeNull();
    expect(seenByA?.length).toBe(1);

    // User B gets an empty result set — RLS filters by auth.uid().
    const { data: seenByB, error: bErr } = await userB.client
      .from("journal_entries")
      .select("*")
      .eq("id", userAJournalId);
    expect(bErr).toBeNull();
    expect(seenByB).toEqual([]);
  }, 15_000);
});
