import { randomUUID } from "node:crypto";
import { activeSidebarTree, getSidebarTree } from "@/lib/db/queries/sidebar";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * DB-backed check on the sidebar tree's single LEFT JOIN.
 *
 * `getSidebarTree` used to be two selects stitched together in memory; it is
 * now one join, because it sits on the blocking path of every (app) render and
 * the layout used to call it twice. Two things can only be checked against a
 * real Postgres:
 *
 *  1. an area whose every project is filtered out still comes back, with an
 *     empty project list. That is the failure mode of putting the project
 *     predicates in the WHERE clause instead of the ON clause, and it is
 *     invisible in any fixture where every area happens to have a live project.
 *  2. `activeSidebarTree(tree(true))` really equals `tree(false)`. The layout
 *     now fetches only the archived-inclusive tree and derives the active one,
 *     so that equality is load-bearing rather than incidental. It has to hold
 *     for synthesized expiry (issue #55) too, not just explicit archivedAt.
 *
 * Seeds an isolated throwaway user and tears it down via the users cascade, so
 * it never observes or disturbs real rows. Skips when DATABASE_URL is unset
 * (CI has no local DB), following tests/db-smoke.test.ts.
 */

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const userId = randomUUID();
const areaLive = randomUUID();
const areaEmptied = randomUUID();
const areaArchived = randomUUID();

const projLive = randomUUID();
const projArchived = randomUUID();
const projExpiredClass = randomUUID();
const projExpiredEndDate = randomUUID();
const projFuture = randomUUID();
const projInArchivedArea = randomUUID();

describeDb("sidebar tree SQL", () => {
  // biome-ignore lint/suspicious/noExplicitAny: postgres-js sql tag
  let sql: any;

  beforeAll(async () => {
    sql = postgres(url as string, { prepare: false });
    const email = `sidebar-tree-${userId}@test.local`;

    // public.users.id FKs to auth.users.id, so the auth row comes first.
    await sql`INSERT INTO auth.users (id, email) VALUES (${userId}, ${email})`;
    await sql`INSERT INTO users (id, email) VALUES (${userId}, ${email}) ON CONFLICT (id) DO NOTHING`;

    // order_index pins the expected area order; created_at is the tie-breaker
    // the query also sorts on, so no two areas tie on both.
    await sql`INSERT INTO areas (id, user_id, name, order_index, archived_at, created_at) VALUES
      (${areaLive},     ${userId}, 'Live',     0, NULL,  now() - interval '3 minutes'),
      (${areaEmptied},  ${userId}, 'Emptied',  1, NULL,  now() - interval '2 minutes'),
      (${areaArchived}, ${userId}, 'Archived', 2, now(), now() - interval '1 minute')`;

    // areaLive keeps one live project. areaEmptied's only projects are all
    // filtered out of the active view, one by each of the three mechanisms:
    // explicit archived_at, an expired class semester, and a past end_date.
    // `class_fields_consistent` requires course_code whenever is_class is true.
    await sql`INSERT INTO projects
        (id, user_id, area_id, name, order_index, is_class, course_code, archived_at, end_date, semester_term, semester_year, created_at)
      VALUES
      (${projLive},            ${userId}, ${areaLive},     'Live project',    0, false, NULL,        NULL,  NULL,         NULL,     NULL, now() - interval '6 minutes'),
      (${projFuture},          ${userId}, ${areaLive},     'Future project',  1, false, NULL,        NULL,  '2999-01-01', NULL,     NULL, now() - interval '5 minutes'),
      (${projArchived},        ${userId}, ${areaEmptied},  'Archived',        0, false, NULL,        now(), NULL,         NULL,     NULL, now() - interval '4 minutes'),
      (${projExpiredClass},    ${userId}, ${areaEmptied},  'Old class',       1, true,  'CPSC 223',  NULL,  NULL,         'spring', 2020, now() - interval '3 minutes'),
      (${projExpiredEndDate},  ${userId}, ${areaEmptied},  'Finished',        2, false, NULL,        NULL,  '2020-01-01', NULL,     NULL, now() - interval '2 minutes'),
      (${projInArchivedArea},  ${userId}, ${areaArchived}, 'Orphaned',        0, false, NULL,        NULL,  NULL,         NULL,     NULL, now() - interval '1 minute')`;
  }, 20_000);

  afterAll(async () => {
    if (!sql) return;
    // The users cascade clears every fixture row; auth.users is the root.
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql`DELETE FROM auth.users WHERE id = ${userId}`;
    await sql.end();
  });

  it("returns every area with includeArchived, in order, with its projects nested", async () => {
    const tree = await getSidebarTree(userId, true);

    expect(tree.map((a) => a.name)).toEqual(["Live", "Emptied", "Archived"]);
    expect(tree[0].projects.map((p) => p.name)).toEqual(["Live project", "Future project"]);
    expect(tree[1].projects.map((p) => p.name)).toEqual(["Archived", "Old class", "Finished"]);
    expect(tree[2].projects.map((p) => p.name)).toEqual(["Orphaned"]);
  });

  it("keeps an area whose every project is archived, with an empty project list", async () => {
    const tree = await getSidebarTree(userId, false);

    // The regression this guards: with the project predicates in the WHERE
    // clause instead of the ON clause, "Emptied" would vanish entirely.
    expect(tree.map((a) => a.name)).toEqual(["Live", "Emptied"]);
    expect(tree[1].projects).toEqual([]);
  });

  it("drops an archived area and everything under it", async () => {
    const tree = await getSidebarTree(userId, false);
    expect(tree.find((a) => a.id === areaArchived)).toBeUndefined();
    expect(tree.flatMap((a) => a.projects).map((p) => p.id)).not.toContain(projInArchivedArea);
  });

  it("synthesizes archivedAt for an expired class and a past end date", async () => {
    const tree = await getSidebarTree(userId, true);
    const emptied = tree.find((a) => a.id === areaEmptied);

    const oldClass = emptied?.projects.find((p) => p.id === projExpiredClass);
    const finished = emptied?.projects.find((p) => p.id === projExpiredEndDate);
    // spring 2020 ends 2020-05-31; the explicit end date is 2020-01-01.
    expect(oldClass?.archivedAt?.toISOString().slice(0, 10)).toBe("2020-05-31");
    expect(finished?.archivedAt?.toISOString().slice(0, 10)).toBe("2020-01-01");

    // A future end date is not expiry.
    const future = tree
      .find((a) => a.id === areaLive)
      ?.projects.find((p) => p.id === projFuture);
    expect(future?.archivedAt).toBeNull();
  });

  it("derives the active tree from the archived-inclusive one, exactly", async () => {
    // The equality (app)/layout.tsx now depends on: one round trip, two views.
    const [all, active] = await Promise.all([
      getSidebarTree(userId, true),
      getSidebarTree(userId, false),
    ]);

    expect(activeSidebarTree(all)).toEqual(active);
  });
});
