import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestUser, deleteTestUser, type TestUser } from "./helpers/test-users";

/**
 * WIKI-MODEL-07 / T-21-06: cross-user owner isolation on the folder_projects
 * junction (Phase 21). The owner-only RLS quartet (user_id = auth.uid()) added
 * in migration 0034 must make a user's folder->project links invisible and
 * immutable to every other user.
 *
 * User A creates a folder, a project, and a folder_projects link between them
 * (all under A's JWT). Then we assert that User B — a second signed-in client —
 *   (a) SELECTs 0 of A's folder_projects rows,
 *   (b) cannot INSERT a folder_projects row carrying user_id = A.id (RLS
 *       WITH CHECK on INSERT blocks the spoof), and
 *   (c) cannot DELETE A's folder_projects row (RLS USING on DELETE blocks it,
 *       so A's row survives).
 *
 * Requires:
 *   - Local Supabase running (`pnpm dlx supabase start`)
 *   - SUPABASE_SERVICE_ROLE_KEY + NEXT_PUBLIC_SUPABASE_URL +
 *     NEXT_PUBLIC_SUPABASE_ANON_KEY in `.env.test.local`
 *   - Migration 0034_wiki_data_model_restructure.sql applied (creates the
 *     folder_projects table + RLS quartet).
 */
describe("folder_projects RLS (cross-user isolation)", () => {
  let userA: TestUser;
  let userB: TestUser;

  // A's owned rows, created under A's JWT in beforeAll.
  let folderId: string;
  let projectId: string;
  let linkId: string;

  beforeAll(async () => {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY required for RLS tests");
    }
    userA = await createTestUser();
    userB = await createTestUser();

    // User A creates a folder (page_folders), a project, and links them.
    const { data: folder, error: folderErr } = await userA.client
      .from("page_folders")
      .insert({ user_id: userA.id, name: "A's folder" })
      .select()
      .single();
    expect(folderErr).toBeNull();
    expect(folder).toBeTruthy();
    folderId = folder!.id;

    // projects.area_id is NOT NULL, so A needs an area to hang the project on.
    const { data: area, error: areaErr } = await userA.client
      .from("areas")
      .insert({ user_id: userA.id, name: "A's area" })
      .select()
      .single();
    expect(areaErr).toBeNull();
    expect(area).toBeTruthy();

    const { data: project, error: projErr } = await userA.client
      .from("projects")
      .insert({ user_id: userA.id, area_id: area!.id, name: "A's project" })
      .select()
      .single();
    expect(projErr).toBeNull();
    expect(project).toBeTruthy();
    projectId = project!.id;

    const { data: link, error: linkErr } = await userA.client
      .from("folder_projects")
      .insert({ user_id: userA.id, folder_id: folderId, project_id: projectId })
      .select()
      .single();
    expect(linkErr).toBeNull();
    expect(link).toBeTruthy();
    linkId = link!.id;
  }, 30_000);

  afterAll(async () => {
    if (userA) await deleteTestUser(userA.id);
    if (userB) await deleteTestUser(userB.id);
  }, 30_000);

  it("User B SELECTs 0 of User A's folder_projects rows", async () => {
    const { data, error } = await userB.client
      .from("folder_projects")
      .select("*")
      .eq("user_id", userA.id);

    // RLS makes A's rows invisible; the query succeeds but returns nothing.
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(0);
  }, 20_000);

  it("User B cannot INSERT a folder_projects row as User A (WITH CHECK blocks the spoof)", async () => {
    const { data, error } = await userB.client
      .from("folder_projects")
      .insert({ user_id: userA.id, folder_id: folderId, project_id: projectId })
      .select();

    // The INSERT must not land a row owned by A. RLS WITH CHECK rejects it
    // (PostgREST surfaces this as an error and/or zero returned rows).
    const insertedAsA = (data ?? []).length > 0;
    expect(error !== null || !insertedAsA).toBe(true);

    // Confirm via the service role that A still has exactly one link row — no
    // spoofed row leaked through under A's user_id.
    const { count } = await userA.client
      .from("folder_projects")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userA.id);
    expect(count).toBe(1);
  }, 20_000);

  it("User B cannot DELETE User A's folder_projects row", async () => {
    await userB.client.from("folder_projects").delete().eq("id", linkId);

    // RLS USING on DELETE filters A's row out of B's view, so the delete is a
    // no-op. A's row must survive.
    const { data, error } = await userA.client
      .from("folder_projects")
      .select("id")
      .eq("id", linkId);
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  }, 20_000);
});
