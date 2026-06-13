/**
 * Phase 17 — cross-user RLS isolation for nutrition tables.
 *
 * Pattern mirrors apps/web/tests/rls.test.ts (TEST-04). Two users are created
 * via the admin API, each with a signed-in anon-key client. User A inserts rows;
 * User B's client selects the same table and must receive an empty result —
 * proving the food_logs / foods / meals RLS policies enforce user_id = auth.uid().
 *
 * Implements NUTR-RLS-01 (cross-user food_logs isolation).
 *
 * NOTES:
 * - Requires SUPABASE_SERVICE_ROLE_KEY + local Supabase running (migration 0029 applied).
 * - If Docker / local Supabase is not running, tests will fail at createTestUser()
 *   which is the correct failure mode (environment not ready, not a code bug).
 * - food_logs requires a foods row (FK food_id NOT NULL), so the food insert is
 *   a prerequisite step, not part of the isolation assertion itself.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "../helpers/test-users";

describe("Phase 17 nutrition — cross-user RLS isolation (NUTR-RLS-01)", () => {
  let userA: TestUser;
  let userB: TestUser;

  // IDs of rows inserted by user A — used to scope the select assertions.
  let userAFoodId: string;
  let userAFoodLogId: string;
  let userAMealId: string;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error(
        "SUPABASE_SERVICE_ROLE_KEY required — set in .env.local for local Supabase"
      );
    }
    userA = await createTestUser();
    userB = await createTestUser();

    // Insert a foods row as user A (prerequisite for food_logs FK)
    const { data: food, error: foodErr } = await userA.client
      .from("foods")
      .insert({
        user_id: userA.id,
        name: "Test Food RLS",
        kcal_per_100g: "0",
        protein_per_100g: "0",
        carbs_per_100g: "0",
        fat_per_100g: "0",
      })
      .select()
      .single();
    if (foodErr || !food) throw new Error(`food insert failed: ${foodErr?.message}`);
    userAFoodId = food.id as string;

    // Insert a food_logs row as user A
    const { data: log, error: logErr } = await userA.client
      .from("food_logs")
      .insert({
        user_id: userA.id,
        log_date: "2026-06-12",
        meal_slot: "breakfast",
        food_id: userAFoodId,
        quantity: "1",
        kcal: 0,
        protein_g: "0",
        carbs_g: "0",
        fat_g: "0",
      })
      .select()
      .single();
    if (logErr || !log) throw new Error(`food_log insert failed: ${logErr?.message}`);
    userAFoodLogId = log.id as string;

    // Insert a meals row as user A
    const { data: meal, error: mealErr } = await userA.client
      .from("meals")
      .insert({ user_id: userA.id, name: "Test Meal RLS" })
      .select()
      .single();
    if (mealErr || !meal) throw new Error(`meal insert failed: ${mealErr?.message}`);
    userAMealId = meal.id as string;
  }, 30_000);

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  }, 30_000);

  it("user B cannot read user A's food_logs", async () => {
    // User A can see their own log
    const { data: seenByA, error: aErr } = await userA.client
      .from("food_logs")
      .select("*")
      .eq("id", userAFoodLogId);
    expect(aErr).toBeNull();
    expect(seenByA?.length).toBe(1);

    // User B gets an empty result set — RLS filters by auth.uid()
    const { data: seenByB, error: bErr } = await userB.client
      .from("food_logs")
      .select("*")
      .eq("id", userAFoodLogId);
    expect(bErr).toBeNull();
    expect(seenByB?.length).toBe(0);
  }, 15_000);

  it("user B cannot read user A's foods", async () => {
    // User A can see their own food
    const { data: seenByA, error: aErr } = await userA.client
      .from("foods")
      .select("*")
      .eq("id", userAFoodId);
    expect(aErr).toBeNull();
    expect(seenByA?.length).toBe(1);

    // User B gets empty — RLS blocks cross-user food access
    const { data: seenByB, error: bErr } = await userB.client
      .from("foods")
      .select("*")
      .eq("id", userAFoodId);
    expect(bErr).toBeNull();
    expect(seenByB?.length).toBe(0);
  }, 15_000);

  it("user B cannot read user A's meals", async () => {
    // User A can see their own meal
    const { data: seenByA, error: aErr } = await userA.client
      .from("meals")
      .select("*")
      .eq("id", userAMealId);
    expect(aErr).toBeNull();
    expect(seenByA?.length).toBe(1);

    // User B gets empty — RLS blocks cross-user meal access
    const { data: seenByB, error: bErr } = await userB.client
      .from("meals")
      .select("*")
      .eq("id", userAMealId);
    expect(bErr).toBeNull();
    expect(seenByB?.length).toBe(0);
  }, 15_000);
});
