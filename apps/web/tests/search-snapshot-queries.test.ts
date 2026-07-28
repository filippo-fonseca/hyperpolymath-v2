import { randomUUID } from "node:crypto";
import { getCapturesForUser } from "@/lib/db/queries/captures";
import { getPagesForUser } from "@/lib/db/queries/pages";
import { getAllTasksForUser } from "@/lib/db/queries/tasks";
import { getSearchCaptures, getSearchPages, getSearchTasks } from "@/lib/search/snapshot-queries";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Equivalence check on the search snapshot's own reads.
 *
 * The snapshot used to build its task, capture and page slices by calling the
 * whole-entity helpers the feature pages use and discarding most of what came
 * back. It now has narrow queries of its own, which is eight fewer Postgres
 * statements per snapshot. The thing that has to stay true is that the slices
 * are byte-identical, so each test below derives the expected value from the
 * OLD code path — the entity helper plus the mapping snapshot.ts used to do
 * inline — and compares.
 *
 * The fixture deliberately gives every entity the links the narrow queries
 * stopped fetching (task hashtags and people, capture projects and people,
 * page folders, project links and custom fields), because a fixture without
 * them could not tell a correct narrowing from a lucky one.
 *
 * Seeds an isolated throwaway user and tears it down via the users cascade.
 * Skips when DATABASE_URL is unset (CI has no local DB), following
 * tests/db-smoke.test.ts.
 */

const url = process.env.DATABASE_URL;
const describeDb = url ? describe : describe.skip;

const userId = randomUUID();
const areaId = randomUUID();
const projectA = randomUUID();
const projectB = randomUUID();
const taskLinked = randomUUID();
const taskBare = randomUUID();
const capTagged = randomUUID();
const capBare = randomUUID();
const folderId = randomUUID();
const pagePinned = randomUUID();
const pagePlain = randomUUID();
const tagResearch = randomUUID();
const tagYale = randomUUID();
const personId = randomUUID();
const fieldDefId = randomUUID();

describeDb("search snapshot queries", () => {
  // biome-ignore lint/suspicious/noExplicitAny: postgres-js sql tag
  let sql: any;

  beforeAll(async () => {
    sql = postgres(url as string, { prepare: false });
    const email = `search-snapshot-${userId}@test.local`;

    await sql`INSERT INTO auth.users (id, email) VALUES (${userId}, ${email})`;
    await sql`INSERT INTO users (id, email) VALUES (${userId}, ${email}) ON CONFLICT (id) DO NOTHING`;

    await sql`INSERT INTO areas (id, user_id, name) VALUES (${areaId}, ${userId}, 'Research')`;
    await sql`INSERT INTO projects (id, user_id, area_id, name, order_index) VALUES
      (${projectA}, ${userId}, ${areaId}, 'Thesis', 0),
      (${projectB}, ${userId}, ${areaId}, 'Lab', 1)`;

    await sql`INSERT INTO hashtags (id, user_id, name, display_name) VALUES
      (${tagResearch}, ${userId}, 'research', 'research'),
      (${tagYale},     ${userId}, 'yale',     'Yale')`;
    await sql`INSERT INTO people (id, user_id, name) VALUES (${personId}, ${userId}, 'Ada')`;

    // One task with every link the narrow query stopped fetching, one with none.
    await sql`INSERT INTO tasks (id, user_id, title, priority, status, due_date, kanban_position, created_at) VALUES
      (${taskLinked}, ${userId}, 'Write the chapter', 'P1', 'in progress', '2026-08-01', 0, now() - interval '2 minutes'),
      (${taskBare},   ${userId}, 'Unlinked task',     'P3', 'not started', NULL,         1, now() - interval '1 minute')`;
    await sql`INSERT INTO tasks_projects (task_id, project_id, user_id) VALUES
      (${taskLinked}, ${projectA}, ${userId}),
      (${taskLinked}, ${projectB}, ${userId})`;
    await sql`INSERT INTO tasks_hashtags (task_id, hashtag_id, user_id) VALUES
      (${taskLinked}, ${tagResearch}, ${userId})`;
    await sql`INSERT INTO people_references (user_id, from_type, from_id, person_id) VALUES
      (${userId}, 'task', ${taskLinked}, ${personId})`;

    await sql`INSERT INTO captures (id, user_id, content, created_at) VALUES
      (${capTagged}, ${userId}, 'Tagged capture', now() - interval '2 minutes'),
      (${capBare},   ${userId}, 'Bare capture',   now() - interval '1 minute')`;
    await sql`INSERT INTO captures_hashtags (capture_id, hashtag_id, user_id) VALUES
      (${capTagged}, ${tagResearch}, ${userId}),
      (${capTagged}, ${tagYale},     ${userId})`;
    await sql`INSERT INTO captures_projects (capture_id, project_id, user_id) VALUES
      (${capTagged}, ${projectA}, ${userId})`;
    await sql`INSERT INTO people_references (user_id, from_type, from_id, person_id) VALUES
      (${userId}, 'capture', ${capTagged}, ${personId})`;

    // Pinned first, then by updated_at desc: the order the narrow page query
    // has to reproduce without the folder join.
    await sql`INSERT INTO page_folders (id, user_id, name) VALUES (${folderId}, ${userId}, 'Notes')`;
    await sql`INSERT INTO pages (id, user_id, folder_id, title, content, emoji, pinned, updated_at) VALUES
      (${pagePlain},  ${userId}, ${folderId}, 'Plain page',  'plain body',  NULL,  false, now() - interval '2 minutes'),
      (${pagePinned}, ${userId}, NULL,        'Pinned page', 'pinned body', '📌',  true,  now() - interval '3 minutes')`;
    await sql`INSERT INTO pages_projects (page_id, project_id, user_id) VALUES
      (${pagePlain}, ${projectA}, ${userId})`;
    await sql`INSERT INTO page_field_definitions (id, user_id, name, type, scope, order_index) VALUES
      (${fieldDefId}, ${userId}, 'Status', 'text', 'wiki', 0)`;
    await sql`INSERT INTO page_field_values (page_id, field_definition_id, user_id, value) VALUES
      (${pagePlain}, ${fieldDefId}, ${userId}, ${sql.json("draft")})`;
  }, 20_000);

  afterAll(async () => {
    if (!sql) return;
    await sql`DELETE FROM users WHERE id = ${userId}`;
    await sql`DELETE FROM auth.users WHERE id = ${userId}`;
    await sql.end();
  });

  it("returns the same task slice the entity helper did", async () => {
    const [narrow, entities] = await Promise.all([
      getSearchTasks(userId),
      getAllTasksForUser(userId),
    ]);

    const expected = entities.map((t) => ({
      id: t.id,
      title: t.title,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      createdAt: t.createdAt.toISOString(),
      projectIds: t.projects.map((p) => p.id),
    }));

    expect(narrow).toEqual(expected);
    // Not vacuous: the linked task really does carry its project ids.
    expect(narrow.find((t) => t.id === taskLinked)?.projectIds).toHaveLength(2);
    expect(narrow.find((t) => t.id === taskBare)?.projectIds).toEqual([]);
  });

  it("returns the same capture slice the entity helper did", async () => {
    const [narrow, entities] = await Promise.all([
      getSearchCaptures(userId, 1000),
      getCapturesForUser(userId, { limit: 1000 }),
    ]);

    const expected = entities.map((c) => ({
      id: c.id,
      text: c.content,
      tags: c.hashtags.map((h) => h.displayName),
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    }));

    expect(narrow).toEqual(expected);
    expect(
      narrow
        .find((c) => c.id === capTagged)
        ?.tags.slice()
        .sort()
    ).toEqual(["Yale", "research"]);
    expect(narrow.find((c) => c.id === capBare)?.tags).toEqual([]);
  });

  it("returns the same page slice the entity helper did, in the same order", async () => {
    const [narrow, entities] = await Promise.all([getSearchPages(userId), getPagesForUser(userId)]);

    const expected = entities.map((p) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      emoji: p.emoji,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));

    expect(narrow).toEqual(expected);
    // Pinned wins over the newer updated_at, which is the ordering the dropped
    // folder join must not have been carrying.
    expect(narrow.map((p) => p.id)).toEqual([pagePinned, pagePlain]);
  });

  it("honours the capture limit", async () => {
    const narrow = await getSearchCaptures(userId, 1);
    expect(narrow).toHaveLength(1);
    expect(narrow[0].id).toBe(capBare); // newest first
  });
});
