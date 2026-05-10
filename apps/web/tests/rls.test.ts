import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";

describe("RLS — cross-user isolation (TEST-04)", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY required — set in .env.local for local Supabase");
    }
    userA = await createTestUser();
    userB = await createTestUser();
  }, 30_000);

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  }, 30_000);

  it("user A's areas are invisible to user B", async () => {
    // User A inserts an area
    const { data: inserted, error: insertErr } = await userA.client
      .from("areas")
      .insert({ user_id: userA.id, name: "Yale" })
      .select()
      .single();
    expect(insertErr).toBeNull();
    expect(inserted).toBeTruthy();

    // User A sees the area
    const { data: seenByA, error: aErr } = await userA.client
      .from("areas")
      .select("*")
      .eq("name", "Yale");
    expect(aErr).toBeNull();
    expect(seenByA?.length).toBe(1);

    // User B does NOT see the area
    const { data: seenByB, error: bErr } = await userB.client
      .from("areas")
      .select("*")
      .eq("name", "Yale");
    expect(bErr).toBeNull();
    expect(seenByB?.length).toBe(0);
  }, 15_000);

  it("user B cannot insert a row claiming user A's user_id (WITH CHECK enforced)", async () => {
    const { error } = await userB.client
      .from("areas")
      .insert({ user_id: userA.id, name: "Hijack" });
    // RLS should block: WITH CHECK requires (auth.uid() = user_id) — userB.id !== userA.id
    expect(error).toBeTruthy();
  }, 10_000);

  it("user A's tasks are invisible to user B", async () => {
    const { data: task } = await userA.client
      .from("tasks")
      .insert({ user_id: userA.id, title: "ship phase 1" })
      .select()
      .single();
    expect(task).toBeTruthy();

    const { data: seenByB } = await userB.client
      .from("tasks")
      .select("*")
      .eq("title", "ship phase 1");
    expect(seenByB?.length).toBe(0);
  }, 10_000);
});
