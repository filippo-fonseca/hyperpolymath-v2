import { randomUUID } from "node:crypto";
import { buildCaptureGraphForUser } from "@/lib/db/queries/capture-graph";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed check on the four grouped self-joins in the captures graph.
 *
 * The pure assembly is covered in capture-graph-edges.test.ts; what can only be
 * checked against a real Postgres is that the SQL itself is valid and pairs the
 * rows it claims to — that a `shared_hashtag` join really emits one weighted
 * row per pair, and that `co_reference` really excludes capture targets.
 *
 * Seeds an isolated throwaway user and tears it down via the users cascade, so
 * it never observes or disturbs real rows. Skips when DATABASE_URL is unset
 * (CI has no local DB), following tests/db-smoke.test.ts.
 */

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

// One id per fixture entity, so assertions can name them.
const userId = randomUUID();
const capA = randomUUID();
const capB = randomUUID();
const capC = randomUUID();
const tagResearch = randomUUID();
const tagYale = randomUUID();
const projectId = randomUUID();
const areaId = randomUUID();
const taskId = randomUUID();

describeDb("capture graph SQL", () => {
  // biome-ignore lint/suspicious/noExplicitAny: postgres-js sql tag
  let sql: any;

  beforeAll(async () => {
    sql = postgres(url as string, { prepare: false });

    // public.users.id FKs to auth.users.id, so the auth row comes first. Only
    // id is NOT NULL there; the rest of the auth record is irrelevant here.
    await sql`INSERT INTO auth.users (id, email) VALUES (${userId}, ${`u6-graph-${userId}@test.local`})`;
    // A trigger on auth.users already mirrors the row into public.users, so
    // this is a belt-and-braces insert for DBs without that trigger.
    await sql`INSERT INTO users (id, email) VALUES (${userId}, ${`u6-graph-${userId}@test.local`}) ON CONFLICT (id) DO NOTHING`;
    await sql`INSERT INTO areas (id, user_id, name) VALUES (${areaId}, ${userId}, 'Research')`;
    await sql`INSERT INTO projects (id, user_id, area_id, name) VALUES (${projectId}, ${userId}, ${areaId}, 'Marathon training')`;
    await sql`INSERT INTO tasks (id, user_id, title) VALUES (${taskId}, ${userId}, 'Book the flight')`;

    // Oldest → newest, so the createdAt ordering is deterministic.
    await sql`INSERT INTO captures (id, user_id, content, created_at) VALUES
      (${capA}, ${userId}, 'Capture A about tagging', now() - interval '3 minutes'),
      (${capB}, ${userId}, 'Capture B about tagging', now() - interval '2 minutes'),
      (${capC}, ${userId}, 'Capture C stands alone', now() - interval '1 minute')`;

    await sql`INSERT INTO hashtags (id, user_id, name, display_name) VALUES
      (${tagResearch}, ${userId}, 'research', 'research'),
      (${tagYale}, ${userId}, 'yale', 'Yale')`;

    // A and B share BOTH tags (weight 2); C shares none.
    await sql`INSERT INTO captures_hashtags (capture_id, hashtag_id, user_id) VALUES
      (${capA}, ${tagResearch}, ${userId}),
      (${capA}, ${tagYale}, ${userId}),
      (${capB}, ${tagResearch}, ${userId}),
      (${capB}, ${tagYale}, ${userId})`;

    // A and C share a project.
    await sql`INSERT INTO captures_projects (capture_id, project_id, user_id) VALUES
      (${capA}, ${projectId}, ${userId}),
      (${capC}, ${projectId}, ${userId})`;

    await sql`INSERT INTO entity_references (user_id, source_type, source_id, target_type, target_id) VALUES
      -- A directly references C
      (${userId}, 'capture', ${capA}, 'capture', ${capC}),
      -- B and C both reference the same task → one co_reference edge
      (${userId}, 'capture', ${capB}, 'task', ${taskId}),
      (${userId}, 'capture', ${capC}, 'task', ${taskId})`;
  }, 20_000);

  afterAll(async () => {
    if (!sql) return;
    // The users cascade clears every fixture row; auth.users is the root.
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql`DELETE FROM auth.users WHERE id = ${userId}`;
    await sql.end();
  });

  it("returns the user's captures as nodes, newest first, with tags and projects folded in", async () => {
    const graph = await buildCaptureGraphForUser(userId);

    expect(graph.nodes.map((n) => n.id)).toEqual([capC, capB, capA]);
    expect(graph.meta.totalCaptures).toBe(3);

    const a = graph.nodes.find((n) => n.id === capA);
    expect(a?.label).toBe("Capture A about tagging");
    expect(a?.hashtags.sort()).toEqual(["research", "yale"]);
    expect(a?.projectIds).toEqual([projectId]);

    const b = graph.nodes.find((n) => n.id === capB);
    expect(b?.projectIds).toEqual([]);
  });

  it("emits one weighted shared_hashtag edge per pair, not one per shared tag", async () => {
    const graph = await buildCaptureGraphForUser(userId);
    const tagEdges = graph.edges.filter((e) => e.kind === "shared_hashtag");

    expect(tagEdges).toHaveLength(1);
    expect(tagEdges[0].weight).toBe(2);
    expect([tagEdges[0].source, tagEdges[0].target].sort()).toEqual([capA, capB].sort());
  });

  it("finds the direct_reference between two captures", async () => {
    const graph = await buildCaptureGraphForUser(userId);
    const refEdges = graph.edges.filter((e) => e.kind === "direct_reference");

    expect(refEdges).toHaveLength(1);
    expect([refEdges[0].source, refEdges[0].target].sort()).toEqual([capA, capC].sort());
  });

  it("pairs two captures that reference the same task and labels the edge with it", async () => {
    const graph = await buildCaptureGraphForUser(userId);
    const coEdges = graph.edges.filter((e) => e.kind === "co_reference");

    expect(coEdges).toHaveLength(1);
    expect([coEdges[0].source, coEdges[0].target].sort()).toEqual([capB, capC].sort());
    expect(coEdges[0].label).toBe("Book the flight");
  });

  it("does not turn a shared capture target into a co_reference edge", async () => {
    // A→C is a capture target. If the co_reference join failed to exclude
    // capture targets, any second capture referencing C would co-reference A.
    const graph = await buildCaptureGraphForUser(userId);
    const coEdges = graph.edges.filter((e) => e.kind === "co_reference");

    expect(coEdges.every((e) => e.label !== "Capture C stands alone")).toBe(true);
  });

  it("emits the shared_project edge", async () => {
    const graph = await buildCaptureGraphForUser(userId);
    const projEdges = graph.edges.filter((e) => e.kind === "shared_project");

    expect(projEdges).toHaveLength(1);
    expect([projEdges[0].source, projEdges[0].target].sort()).toEqual(
      [capA, capC].sort(),
    );
  });

  it("scopes every layer to the owning user", async () => {
    const graph = await buildCaptureGraphForUser(randomUUID());
    expect(graph.nodes).toEqual([]);
    expect(graph.edges).toEqual([]);
  });
});
