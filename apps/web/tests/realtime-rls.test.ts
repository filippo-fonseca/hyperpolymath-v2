import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";

/**
 * RT-04 + Phase 1 RLS carryover: Supabase Realtime broadcasts respect RLS.
 *
 * User A subscribing to `<table>` with filter `user_id=eq.${userA.id}` MUST
 * NOT receive postgres_changes events for User B's row mutations. This
 * protects the single-user-architecture, multi-user-readiness invariant
 * (see PROJECT.md): cross-user data leakage is impossible even via
 * Realtime — the same RLS policy that Phase 1's tests/rls.test.ts
 * validates for SELECT/INSERT also applies to Realtime broadcast
 * authorization.
 *
 * Each test mounts a fresh subscription channel for User A, has User B
 * mutate a row of their own, then asserts no payload was delivered to
 * User A's listener. A positive control test ensures the subscription is
 * actually alive (User A's own insert does fire the listener).
 *
 * Requires:
 *   - Local Supabase running (`pnpm dlx supabase start`)
 *   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY in `.env.test.local`
 *   - The Phase 3 publication migration (`0006_realtime_publication.sql`)
 *     applied — without it, postgres_changes events are not broadcast at
 *     all (the positive control would fail).
 */
describe("RLS-aware Realtime broadcasts (RT-04 / Phase 1 carryover)", () => {
  let userA: TestUser;
  let userB: TestUser;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY required for Realtime tests");
    }
    userA = await createTestUser();
    userB = await createTestUser();
  }, 30_000);

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  }, 30_000);

  async function waitForChannelJoined(
    channel: ReturnType<TestUser["client"]["channel"]>,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const start = Date.now();
      const t = setInterval(() => {
        if (channel.state === "joined") {
          clearInterval(t);
          resolve();
        } else if (Date.now() - start > 10_000) {
          clearInterval(t);
          reject(new Error(`channel did not join — state=${channel.state}`));
        }
      }, 50);
    });
  }

  it("areas: User A's subscription receives 0 events for User B's insert (negative)", async () => {
    const events: unknown[] = [];
    const channel = userA.client
      .channel(`test:areas:${userA.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "areas", filter: `user_id=eq.${userA.id}` },
        (payload) => events.push(payload),
      )
      .subscribe();
    await waitForChannelJoined(channel);

    // User B inserts their own area
    const { error } = await userB.client
      .from("areas")
      .insert({ user_id: userB.id, name: "B's secret area" });
    expect(error).toBeNull();

    // Wait for Realtime propagation — generous slack for cross-process latency
    await new Promise((r) => setTimeout(r, 2_000));
    await channel.unsubscribe();

    expect(events).toHaveLength(0);
  }, 20_000);

  it("areas: User A's subscription receives events for User A's own insert (positive control)", async () => {
    const events: unknown[] = [];
    const channel = userA.client
      .channel(`test:areas-self:${userA.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "areas", filter: `user_id=eq.${userA.id}` },
        (payload) => events.push(payload),
      )
      .subscribe();
    await waitForChannelJoined(channel);

    const { error } = await userA.client
      .from("areas")
      .insert({ user_id: userA.id, name: "A's own area" });
    expect(error).toBeNull();

    await new Promise((r) => setTimeout(r, 2_000));
    await channel.unsubscribe();

    // Positive control — at least 1 event (the INSERT). Proves the channel is
    // actually wired through the publication + Realtime authorization.
    expect(events.length).toBeGreaterThanOrEqual(1);
  }, 20_000);

  it("tasks: User A's subscription receives 0 events for User B's insert", async () => {
    const events: unknown[] = [];
    const channel = userA.client
      .channel(`test:tasks:${userA.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `user_id=eq.${userA.id}` },
        (payload) => events.push(payload),
      )
      .subscribe();
    await waitForChannelJoined(channel);

    const { error } = await userB.client
      .from("tasks")
      .insert({ user_id: userB.id, title: "B's task" });
    expect(error).toBeNull();

    await new Promise((r) => setTimeout(r, 2_000));
    await channel.unsubscribe();

    expect(events).toHaveLength(0);
  }, 20_000);

  it("captures_hashtags join: User A's subscription receives 0 events for User B's tag insert", async () => {
    // Setup: User B needs a capture + a hashtag they own to insert into the join.
    const { data: capture, error: capErr } = await userB.client
      .from("captures")
      .insert({ user_id: userB.id, content: "B's capture" })
      .select()
      .single();
    expect(capErr).toBeNull();
    expect(capture).toBeTruthy();

    const { data: hashtag, error: hashErr } = await userB.client
      .from("hashtags")
      .insert({ user_id: userB.id, name: "btag", display_name: "btag" })
      .select()
      .single();
    expect(hashErr).toBeNull();
    expect(hashtag).toBeTruthy();

    const events: unknown[] = [];
    const channel = userA.client
      .channel(`test:capt-hashtags:${userA.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "captures_hashtags",
          filter: `user_id=eq.${userA.id}`,
        },
        (payload) => events.push(payload),
      )
      .subscribe();
    await waitForChannelJoined(channel);

    const { error } = await userB.client.from("captures_hashtags").insert({
      capture_id: capture!.id,
      hashtag_id: hashtag!.id,
      user_id: userB.id,
    });
    expect(error).toBeNull();

    await new Promise((r) => setTimeout(r, 2_000));
    await channel.unsubscribe();

    expect(events).toHaveLength(0);
  }, 30_000);
});
