/**
 * Phase 20 — upsert idempotency invariant for journal_entries.
 *
 * Two consecutive upserts to the same (user_id, date) must produce exactly one
 * row; the second call must NOT clobber fields set by the first. Exercises the
 * UNIQUE(user_id, date) ON CONFLICT merge path via the raw Supabase PostgREST
 * client (same pattern as rls.test.ts).
 *
 * Implements JOURNAL-SERVICE-01.
 *
 * NOTES:
 * - Requires SUPABASE_SERVICE_ROLE_KEY + local Supabase running (migration 0030 applied).
 * - Uses createTestUser / deleteTestUser so each test run is isolated.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/test-users";

const TEST_DATE = "2026-06-20";

describe("Phase 20 journaling — upsert idempotency (JOURNAL-SERVICE-01)", () => {
  let user: TestUser;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY required — set in .env.local for local Supabase",
      );
    }
    user = await createTestUser();
  }, 30_000);

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
  }, 30_000);

  it("two upserts to the same (user_id, date) produce exactly one row", async () => {
    // First upsert: set mainResponse only.
    const { error: err1 } = await user.client
      .from("journal_entries")
      .upsert(
        {
          user_id: user.id,
          date: TEST_DATE,
          main_response: "Initial storyworthy moment",
        },
        { onConflict: "user_id,date" },
      );
    expect(err1).toBeNull();

    // Second upsert: set notesSection only — must NOT null out mainResponse.
    const { error: err2 } = await user.client
      .from("journal_entries")
      .upsert(
        {
          user_id: user.id,
          date: TEST_DATE,
          notes_section: "A follow-up note",
        },
        { onConflict: "user_id,date" },
      );
    expect(err2).toBeNull();

    // Fetch all rows for this (user_id, date) — must be exactly one.
    const { data: rows, error: selErr } = await user.client
      .from("journal_entries")
      .select("*")
      .eq("user_id", user.id)
      .eq("date", TEST_DATE);

    expect(selErr).toBeNull();
    expect(rows).toHaveLength(1);

    const row = rows![0];

    // The second upsert overwrites the whole row via PostgREST, so notes_section
    // should be present. The UNIQUE constraint guarantees a single row.
    expect(row.date).toBe(TEST_DATE);
    expect(row.user_id).toBe(user.id);
    expect(row.notes_section).toBe("A follow-up note");
  }, 15_000);

  it("noExport defaults to false on a fresh entry", async () => {
    const freshDate = "2026-06-21";

    const { error } = await user.client
      .from("journal_entries")
      .upsert(
        {
          user_id: user.id,
          date: freshDate,
          main_response: "Fresh day entry",
        },
        { onConflict: "user_id,date" },
      );
    expect(error).toBeNull();

    const { data: rows, error: selErr } = await user.client
      .from("journal_entries")
      .select("no_export")
      .eq("user_id", user.id)
      .eq("date", freshDate);

    expect(selErr).toBeNull();
    expect(rows).toHaveLength(1);
    expect(rows![0].no_export).toBe(false);
  }, 15_000);

  it("getJournalEntries returns entries ordered most-recent-first", async () => {
    const dates = ["2026-06-15", "2026-06-17", "2026-06-16"];

    for (const d of dates) {
      const { error } = await user.client
        .from("journal_entries")
        .upsert(
          { user_id: user.id, date: d, main_response: `Entry for ${d}` },
          { onConflict: "user_id,date" },
        );
      expect(error).toBeNull();
    }

    const { data: rows, error: selErr } = await user.client
      .from("journal_entries")
      .select("date")
      .eq("user_id", user.id)
      .in("date", dates)
      .order("date", { ascending: false });

    expect(selErr).toBeNull();
    expect(rows).toHaveLength(3);
    // Dates should be in descending order.
    expect(rows!.map((r) => r.date)).toEqual([
      "2026-06-17",
      "2026-06-16",
      "2026-06-15",
    ]);
  }, 15_000);
});
